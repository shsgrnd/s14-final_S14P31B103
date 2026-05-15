import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import type { SafetyWarning, SnapshotFile, SnapshotHunk } from '@gitcat/shared-types';

const DEFAULT_CONTEXT_LINES = 3;
const DEFAULT_LARGE_FILE_THRESHOLD_BYTES = 512 * 1024;
const DEFAULT_DELETION_WARNING_THRESHOLD = 5;
const EXCLUDED_PATH_SEGMENTS = new Set(['.git', 'node_modules', 'dist', 'build']);

type DiffOpType = 'equal' | 'add' | 'remove';

interface DiffOp {
  type: DiffOpType;
  line: string;
}

interface AnnotatedDiffOp extends DiffOp {
  oldLineNumber: number;
  newLineNumber: number;
}

interface NormalizedFileInput {
  filePath: string;
  absolutePath?: string;
  content: string | null;
  rawBytes: Uint8Array | null;
  sizeBytes: number;
  isBinary: boolean;
  isLargeFile: boolean;
}

interface WorkingFilePair {
  baseline?: NormalizedFileInput;
  current?: NormalizedFileInput;
}

interface RenameMatch {
  oldPath: string;
  newPath: string;
}

export interface SnapshotFileInput {
  filePath: string;
  content?: string | Uint8Array | null;
  sizeBytes?: number;
}

export interface BuildSnapshotDiffOptions {
  workspaceRoot: string;
  ignoreWhitespace?: boolean;
  contextLines?: number;
  largeFileThresholdBytes?: number;
  deletionWarningThreshold?: number;
}

export interface BuildSnapshotDiffParams {
  baselineFiles: SnapshotFileInput[];
  currentFiles: SnapshotFileInput[];
  options: BuildSnapshotDiffOptions;
}

export interface WorkspaceDiffParams {
  workspaceRoot: string;
  baselines: Map<string, Uint8Array>;
  changedFiles: Iterable<string>;
  ignoreWhitespace?: boolean;
  contextLines?: number;
  largeFileThresholdBytes?: number;
  deletionWarningThreshold?: number;
}

export interface SnapshotSkippedFile {
  filePath: string;
  reason: 'outside_workspace' | 'excluded_path' | 'whitespace_only';
}

export interface SnapshotDiffResult {
  patchText: string;
  hunks: SnapshotHunk[];
  changedFiles: SnapshotFile[];
  deletedFiles: string[];
  riskyFiles: string[];
  warnings: SafetyWarning[];
  skippedFiles: SnapshotSkippedFile[];
}

export class SnapshotDiffService {
  async buildFromWorkspace(params: WorkspaceDiffParams): Promise<SnapshotDiffResult> {
    const baselineFiles: SnapshotFileInput[] = [];
    const currentFiles: SnapshotFileInput[] = [];

    for (const [filePath, content] of params.baselines.entries()) {
      baselineFiles.push({ filePath, content });
    }

    for (const filePath of params.changedFiles) {
      const relativePath = this.toWorkspaceRelativePath(params.workspaceRoot, filePath);
      if (!relativePath || this.isExcludedPath(relativePath)) {
        continue;
      }

      const absolutePath = path.resolve(params.workspaceRoot, relativePath);
      try {
        const rawBytes = await fs.readFile(absolutePath);
        currentFiles.push({ filePath: relativePath, content: rawBytes, sizeBytes: rawBytes.byteLength });
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError?.code === 'ENOENT') {
          currentFiles.push({ filePath: relativePath, content: null, sizeBytes: 0 });
          continue;
        }
        throw error;
      }
    }

    return this.buildSnapshotDiff({
      baselineFiles,
      currentFiles,
      options: {
        workspaceRoot: params.workspaceRoot,
        ignoreWhitespace: params.ignoreWhitespace,
        contextLines: params.contextLines,
        largeFileThresholdBytes: params.largeFileThresholdBytes,
        deletionWarningThreshold: params.deletionWarningThreshold,
      },
    });
  }

  buildSnapshotDiff(params: BuildSnapshotDiffParams): SnapshotDiffResult {
    const workspaceRoot = path.resolve(params.options.workspaceRoot);
    const contextLines = params.options.contextLines ?? DEFAULT_CONTEXT_LINES;
    const ignoreWhitespace = params.options.ignoreWhitespace ?? false;
    const largeFileThresholdBytes =
      params.options.largeFileThresholdBytes ?? DEFAULT_LARGE_FILE_THRESHOLD_BYTES;
    const deletionWarningThreshold =
      params.options.deletionWarningThreshold ?? DEFAULT_DELETION_WARNING_THRESHOLD;

    const skippedFiles: SnapshotSkippedFile[] = [];
    const baselineEntries = this.normalizeEntries(
      params.baselineFiles,
      workspaceRoot,
      largeFileThresholdBytes,
      skippedFiles,
    );
    const currentEntries = this.normalizeEntries(
      params.currentFiles,
      workspaceRoot,
      largeFileThresholdBytes,
      skippedFiles,
    );

    const pairs = new Map<string, WorkingFilePair>();
    for (const baseline of baselineEntries) {
      const current = pairs.get(baseline.filePath) ?? {};
      current.baseline = baseline;
      pairs.set(baseline.filePath, current);
    }
    for (const currentEntry of currentEntries) {
      const current = pairs.get(currentEntry.filePath) ?? {};
      current.current = currentEntry;
      pairs.set(currentEntry.filePath, current);
    }

    const renameMatches = this.detectRenameMatches(pairs);
    const renamedOldPaths = new Set(renameMatches.map((match) => match.oldPath));
    const renamedByNewPath = new Map(renameMatches.map((match) => [match.newPath, match.oldPath]));

    const patchChunks: string[] = [];
    const hunks: SnapshotHunk[] = [];
    const changedFiles: SnapshotFile[] = [];

    for (const [filePath, pair] of [...pairs.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      if (renamedOldPaths.has(filePath)) {
        continue;
      }

      const renameFrom = renamedByNewPath.get(filePath);
      const renamedPair = renameFrom ? pairs.get(renameFrom) : undefined;
      const baseline = renamedPair?.baseline ?? pair.baseline;
      const current = pair.current;
      const beforeContent = baseline?.content ?? null;
      const afterContent = current?.content ?? null;
      const beforeHash = this.hashContent(beforeContent, baseline?.rawBytes ?? null);
      const afterHash = this.hashContent(afterContent, current?.rawBytes ?? null);

      if (!renameFrom && beforeContent !== null && afterContent !== null) {
        if (ignoreWhitespace && this.normalizeForWhitespaceDiff(beforeContent) === this.normalizeForWhitespaceDiff(afterContent)) {
          skippedFiles.push({ filePath, reason: 'whitespace_only' });
          continue;
        }
        if (beforeContent === afterContent) {
          continue;
        }
      } else if (!renameFrom && beforeContent === null && afterContent === null) {
        continue;
      }

      const isBinary = baseline?.isBinary || current?.isBinary || false;
      const isLargeFile = baseline?.isLargeFile || current?.isLargeFile || false;
      const status = renameFrom ? 'renamed' : this.inferStatus(beforeContent, afterContent);

      const baseFile: SnapshotFile = {
        filePath,
        status,
        beforeHash: beforeHash ?? undefined,
        afterHash: afterHash ?? undefined,
        isBinary: isBinary || undefined,
        isLargeFile: isLargeFile || undefined,
        importance: 'medium',
        renamedFrom: renameFrom,
        renamedTo: renameFrom ? filePath : undefined,
      };

      if (status === 'renamed') {
        patchChunks.push(
          this.buildUnifiedPatch({
            filePath,
            status,
            beforeHash,
            afterHash,
            renamedFrom: renameFrom,
          }),
        );
        changedFiles.push({
          ...baseFile,
          additions: 0,
          deletions: 0,
          hunkCount: 0,
          hunks: [],
        });
        continue;
      }

      if (isBinary || isLargeFile) {
        baseFile.excludedReason = isBinary ? 'binary' : 'large_file';
        changedFiles.push(baseFile);
        continue;
      }

      const diffOps = this.diffLines(
        this.splitLines(beforeContent ?? ''),
        this.splitLines(afterContent ?? ''),
      );
      const annotatedOps = this.annotateDiffOps(diffOps);
      const hunkSegments = this.buildHunkSegments(annotatedOps, contextLines);
      const fileHunks = this.buildFileHunks(filePath, hunkSegments);
      const additions = diffOps.filter((op) => op.type === 'add').length;
      const deletions = diffOps.filter((op) => op.type === 'remove').length;
      const isCommentOnly = this.isCommentOnlyChange(beforeContent ?? '', afterContent ?? '');

      if (fileHunks.length > 0 || status !== 'modified') {
        patchChunks.push(
          this.buildUnifiedPatch({
            filePath,
            status,
            beforeHash,
            afterHash,
            hunkSegments,
            fileHunks,
          }),
        );
      }

      hunks.push(...fileHunks);
      changedFiles.push({
        ...baseFile,
        additions,
        deletions,
        hunkCount: fileHunks.length,
        hunks: fileHunks,
        isCommentOnly: isCommentOnly || undefined,
        importance: isCommentOnly ? 'low' : 'medium',
      });
    }

    const deletedFiles = changedFiles
      .filter((file) => file.status === 'deleted')
      .map((file) => file.filePath);
    const riskyFiles = changedFiles
      .map((file) => file.filePath)
      .filter((filePath) => this.isRiskyPath(filePath));
    const warnings = this.buildWarnings(deletedFiles, riskyFiles, deletionWarningThreshold);

    return {
      patchText: patchChunks.filter(Boolean).join('\n'),
      hunks,
      changedFiles,
      deletedFiles,
      riskyFiles,
      warnings,
      skippedFiles,
    };
  }

  private normalizeEntries(
    files: SnapshotFileInput[],
    workspaceRoot: string,
    largeFileThresholdBytes: number,
    skippedFiles: SnapshotSkippedFile[],
  ): NormalizedFileInput[] {
    const normalizedEntries = new Map<string, NormalizedFileInput>();

    for (const file of files) {
      const relativePath = this.toWorkspaceRelativePath(workspaceRoot, file.filePath);
      if (!relativePath) {
        skippedFiles.push({ filePath: file.filePath, reason: 'outside_workspace' });
        continue;
      }
      if (this.isExcludedPath(relativePath)) {
        skippedFiles.push({ filePath: relativePath, reason: 'excluded_path' });
        continue;
      }

      const rawBytes = this.toRawBytes(file.content);
      const sizeBytes = file.sizeBytes ?? rawBytes?.byteLength ?? Buffer.byteLength(file.content ?? '', 'utf8');
      const isBinary = rawBytes !== null ? this.isBinaryContent(rawBytes) : false;
      const content = rawBytes === null ? null : isBinary ? null : Buffer.from(rawBytes).toString('utf8');

      normalizedEntries.set(relativePath, {
        filePath: relativePath,
        absolutePath: path.resolve(workspaceRoot, relativePath),
        content,
        rawBytes,
        sizeBytes,
        isBinary,
        isLargeFile: sizeBytes > largeFileThresholdBytes,
      });
    }

    return [...normalizedEntries.values()];
  }

  private toWorkspaceRelativePath(workspaceRoot: string, inputPath: string): string | null {
    if (!inputPath) {
      return null;
    }

    const absolutePath = path.isAbsolute(inputPath)
      ? path.resolve(inputPath)
      : path.resolve(workspaceRoot, inputPath);
    const relativePath = path.relative(workspaceRoot, absolutePath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return null;
    }

    return relativePath.replace(/\\/g, '/');
  }

  private isExcludedPath(relativePath: string): boolean {
    const normalized = relativePath.replace(/\\/g, '/');
    if (normalized.startsWith('.vscode/gitcat/')) {
      return true;
    }

    return normalized.split('/').some((segment) => EXCLUDED_PATH_SEGMENTS.has(segment));
  }

  private toRawBytes(content: SnapshotFileInput['content']): Uint8Array | null {
    if (content === null || content === undefined) {
      return null;
    }
    if (typeof content === 'string') {
      return Buffer.from(content, 'utf8');
    }
    return content;
  }

  private isBinaryContent(bytes: Uint8Array): boolean {
    for (const byte of bytes) {
      if (byte === 0) {
        return true;
      }
    }
    return false;
  }

  private hashContent(content: string | null, rawBytes: Uint8Array | null): string | null {
    if (content === null && rawBytes === null) {
      return null;
    }
    const hash = createHash('sha256');
    if (rawBytes !== null) {
      hash.update(rawBytes);
    } else {
      hash.update(content ?? '', 'utf8');
    }
    return hash.digest('hex');
  }

  private inferStatus(beforeContent: string | null, afterContent: string | null): SnapshotFile['status'] {
    if (beforeContent === null && afterContent !== null) {
      return 'added';
    }
    if (beforeContent !== null && afterContent === null) {
      return 'deleted';
    }
    return 'modified';
  }

  private splitLines(content: string): string[] {
    const normalized = content.replace(/\r\n/g, '\n');
    if (!normalized) {
      return [];
    }
    const parts = normalized.split('\n');
    if (normalized.endsWith('\n')) {
      parts.pop();
    }
    return parts;
  }

  private normalizeForWhitespaceDiff(content: string): string {
    return content.replace(/\s+/g, '');
  }

  private stripComments(content: string): string {
    return content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/^\s*#.*$/gm, '')
      .replace(/^\s*--.*$/gm, '')
      .replace(/\s+/g, '');
  }

  private isCommentOnlyChange(beforeContent: string, afterContent: string): boolean {
    return beforeContent !== afterContent && this.stripComments(beforeContent) === this.stripComments(afterContent);
  }

  private diffLines(oldLines: string[], newLines: string[]): DiffOp[] {
    const oldLength = oldLines.length;
    const newLength = newLines.length;
    const table: number[][] = Array.from({ length: oldLength + 1 }, () =>
      Array<number>(newLength + 1).fill(0),
    );

    for (let oldIndex = oldLength - 1; oldIndex >= 0; oldIndex -= 1) {
      for (let newIndex = newLength - 1; newIndex >= 0; newIndex -= 1) {
        if (oldLines[oldIndex] === newLines[newIndex]) {
          table[oldIndex][newIndex] = table[oldIndex + 1][newIndex + 1] + 1;
        } else {
          table[oldIndex][newIndex] = Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1]);
        }
      }
    }

    const diff: DiffOp[] = [];
    let oldIndex = 0;
    let newIndex = 0;
    while (oldIndex < oldLength && newIndex < newLength) {
      if (oldLines[oldIndex] === newLines[newIndex]) {
        diff.push({ type: 'equal', line: oldLines[oldIndex] });
        oldIndex += 1;
        newIndex += 1;
        continue;
      }

      if (table[oldIndex + 1][newIndex] >= table[oldIndex][newIndex + 1]) {
        diff.push({ type: 'remove', line: oldLines[oldIndex] });
        oldIndex += 1;
      } else {
        diff.push({ type: 'add', line: newLines[newIndex] });
        newIndex += 1;
      }
    }

    while (oldIndex < oldLength) {
      diff.push({ type: 'remove', line: oldLines[oldIndex] });
      oldIndex += 1;
    }
    while (newIndex < newLength) {
      diff.push({ type: 'add', line: newLines[newIndex] });
      newIndex += 1;
    }

    return diff;
  }

  private annotateDiffOps(diffOps: DiffOp[]): AnnotatedDiffOp[] {
    const annotated: AnnotatedDiffOp[] = [];
    let oldLineNumber = 1;
    let newLineNumber = 1;

    for (const op of diffOps) {
      annotated.push({ ...op, oldLineNumber, newLineNumber });
      if (op.type !== 'add') {
        oldLineNumber += 1;
      }
      if (op.type !== 'remove') {
        newLineNumber += 1;
      }
    }

    return annotated;
  }

  private buildHunkSegments(
    annotatedOps: AnnotatedDiffOp[],
    contextLines: number,
  ): AnnotatedDiffOp[][] {
    const changedIndices = annotatedOps
      .map((op, index) => (op.type === 'equal' ? -1 : index))
      .filter((index) => index >= 0);

    if (changedIndices.length === 0) {
      return [];
    }

    const segments: Array<{ start: number; end: number }> = [];
    let currentSegment = {
      start: Math.max(0, changedIndices[0] - contextLines),
      end: Math.min(annotatedOps.length - 1, changedIndices[0] + contextLines),
    };

    for (let index = 1; index < changedIndices.length; index += 1) {
      const candidateStart = Math.max(0, changedIndices[index] - contextLines);
      const candidateEnd = Math.min(annotatedOps.length - 1, changedIndices[index] + contextLines);
      if (candidateStart <= currentSegment.end) {
        currentSegment.end = Math.max(currentSegment.end, candidateEnd);
      } else {
        segments.push(currentSegment);
        currentSegment = { start: candidateStart, end: candidateEnd };
      }
    }
    segments.push(currentSegment);

    return segments.map((segment) => annotatedOps.slice(segment.start, segment.end + 1));
  }

  private buildFileHunks(filePath: string, hunkSegments: AnnotatedDiffOp[][]): SnapshotHunk[] {
    return hunkSegments.map((segment, index) => this.createHunk(filePath, segment, index));
  }

  private createHunk(filePath: string, segment: AnnotatedDiffOp[], index: number): SnapshotHunk {
    const oldLines = segment.filter((op) => op.type !== 'add');
    const newLines = segment.filter((op) => op.type !== 'remove');
    const first = segment[0];

    const oldLineCount = oldLines.length;
    const newLineCount = newLines.length;
    const oldStart = oldLineCount > 0
      ? oldLines[0].oldLineNumber
      : Math.max(first.oldLineNumber - 1, 0);
    const newStart = newLineCount > 0
      ? newLines[0].newLineNumber
      : Math.max(first.newLineNumber - 1, 0);

    return {
      hunkId: `${filePath}#hunk-${index + 1}`,
      filePath,
      oldStart,
      oldLines: oldLineCount,
      newStart,
      newLines: newLineCount,
      beforeText: oldLines.map((op) => op.line).join('\n'),
      afterText: newLines.map((op) => op.line).join('\n'),
    };
  }

  private buildUnifiedPatch(params: {
    filePath: string;
    status: SnapshotFile['status'];
    beforeHash: string | null;
    afterHash: string | null;
    renamedFrom?: string;
    hunkSegments?: AnnotatedDiffOp[][];
    fileHunks?: SnapshotHunk[];
  }): string {
    const { filePath, status, beforeHash, afterHash, renamedFrom, hunkSegments = [], fileHunks = [] } = params;
    const oldPath =
      status === 'added' ? '/dev/null' : `a/${status === 'renamed' ? renamedFrom : filePath}`;
    const newPath = status === 'deleted' ? '/dev/null' : `b/${filePath}`;
    const patchLines = [
      `diff --git a/${status === 'renamed' ? renamedFrom : filePath} b/${filePath}`,
      `index ${this.shortHash(beforeHash)}..${this.shortHash(afterHash)}`,
      `--- ${oldPath}`,
      `+++ ${newPath}`,
    ];

    if (status === 'renamed') {
      patchLines.splice(1, 1);
      patchLines.push('similarity index 100%');
      patchLines.push(`rename from ${renamedFrom}`);
      patchLines.push(`rename to ${filePath}`);
      return patchLines.join('\n');
    }

    if (fileHunks.length === 0) {
      return patchLines.join('\n');
    }

    for (let index = 0; index < fileHunks.length; index += 1) {
      const hunk = fileHunks[index];
      const segment = hunkSegments[index] ?? [];
      patchLines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
      for (const op of segment) {
        const prefix = op.type === 'equal' ? ' ' : op.type === 'add' ? '+' : '-';
        patchLines.push(`${prefix}${op.line}`);
      }
    }

    return patchLines.join('\n');
  }

  private shortHash(hash: string | null): string {
    return hash ? hash.slice(0, 12) : '000000000000';
  }

  private detectRenameMatches(pairs: Map<string, WorkingFilePair>): RenameMatch[] {
    const deletedCandidates: Array<{ filePath: string; hash: string }> = [];
    const addedCandidates: Array<{ filePath: string; hash: string }> = [];

    for (const [filePath, pair] of pairs.entries()) {
      if (pair.baseline && (!pair.current || pair.current.content === null)) {
        const beforeHash = this.hashContent(pair.baseline.content, pair.baseline.rawBytes);
        if (beforeHash) {
          deletedCandidates.push({ filePath, hash: beforeHash });
        }
      }
      if ((!pair.baseline || pair.baseline.content === null) && pair.current && pair.current.content !== null) {
        const afterHash = this.hashContent(pair.current.content, pair.current.rawBytes);
        if (afterHash) {
          addedCandidates.push({ filePath, hash: afterHash });
        }
      }
    }

    const consumedAdds = new Set<string>();
    const matches: RenameMatch[] = [];
    for (const deleted of deletedCandidates) {
      const match = addedCandidates.find(
        (candidate) => candidate.hash === deleted.hash && !consumedAdds.has(candidate.filePath),
      );
      if (!match) {
        continue;
      }

      consumedAdds.add(match.filePath);
      matches.push({ oldPath: deleted.filePath, newPath: match.filePath });
    }

    return matches;
  }

  private isRiskyPath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return (
      normalized.startsWith('.github/') ||
      normalized.startsWith('.vscode/') ||
      normalized.includes('/migrations/') ||
      normalized.endsWith('.env') ||
      normalized.includes('/.env.') ||
      normalized.endsWith('.sql') ||
      normalized.endsWith('schema.ts') ||
      normalized.endsWith('package.json') ||
      normalized.endsWith('pnpm-lock.yaml') ||
      normalized.endsWith('tsconfig.json') ||
      normalized.includes('/config/')
    );
  }

  private buildWarnings(
    deletedFiles: string[],
    riskyFiles: string[],
    deletionWarningThreshold: number,
  ): SafetyWarning[] {
    const warnings: SafetyWarning[] = [];

    if (deletedFiles.length >= deletionWarningThreshold) {
      warnings.push({
        warningId: `warn-large-deletion-${deletedFiles.length}`,
        type: 'large_deletion',
        message: `${deletedFiles.length} files are scheduled for deletion in this snapshot diff.`,
        filePaths: deletedFiles,
        severity: deletedFiles.length >= deletionWarningThreshold * 2 ? 'high' : 'medium',
      });
    }

    if (riskyFiles.length > 0) {
      warnings.push({
        warningId: `warn-sensitive-${riskyFiles.length}`,
        type: 'sensitive_file_change',
        message: 'Risky configuration or migration files changed in this snapshot diff.',
        filePaths: riskyFiles,
        severity: 'high',
      });
    }

    return warnings;
  }
}
