import type { DiffResult } from '@gitcat/git-core';
import type { ConflictKind, MergeConflictRegion } from '@gitcat/shared-types';
import type { GitService } from '../git/GitService';

export const FULL_FILE_CHAR_CAP = 120_000;
const LARGE_HUNK_LINE_THRESHOLD = 80;
const MAX_REGIONS = 5;

export interface DiffHunkSummary {
  lineStart: number;
  lineEnd: number;
  excerpt: string;
}

export interface HunkOverlapSummary {
  lineStart: number;
  lineEnd: number;
  sourceExcerpt: string;
  targetExcerpt: string;
  overlapLines: number;
}

export interface ConflictDetectionInput {
  filePath: string;
  sourceDiff: DiffResult;
  targetDiff: DiffResult;
  sourceHunks: DiffHunkSummary[];
  targetHunks: DiffHunkSummary[];
}

export interface EnrichedConflictFields {
  conflictKind: ConflictKind;
  conflictRegions: MergeConflictRegion[];
  lineStart: number;
  lineEnd: number;
  sourceExcerpt?: string;
  targetExcerpt?: string;
  hasLineOverlap: boolean;
  sourceFullContent?: string;
  targetFullContent?: string;
  baseFullContent?: string;
}

export function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function parseDiffHunks(diffText: string): Map<string, DiffHunkSummary[]> {
  const result = new Map<string, DiffHunkSummary[]>();
  const lines = diffText.split(/\r?\n/);
  let currentFile: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (fileMatch) {
      currentFile = normalizeFilePath(fileMatch[2]);
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/);
    if (!currentFile || !hunkMatch) {
      continue;
    }

    const lineStart = Number(hunkMatch[1]);
    const lineCount = Number(hunkMatch[2] ?? '1');
    const excerpt = lines.slice(index, Math.min(index + 18, lines.length)).join('\n');
    const hunks = result.get(currentFile) ?? [];
    hunks.push({
      lineStart,
      lineEnd: Math.max(lineStart, lineStart + lineCount - 1),
      excerpt,
    });
    result.set(currentFile, hunks);
  }

  return result;
}

export function findAllHunkOverlaps(
  sourceHunks: DiffHunkSummary[],
  targetHunks: DiffHunkSummary[],
): HunkOverlapSummary[] {
  const overlaps: HunkOverlapSummary[] = [];

  for (const sourceHunk of sourceHunks) {
    for (const targetHunk of targetHunks) {
      const lineStart = Math.max(sourceHunk.lineStart, targetHunk.lineStart);
      const lineEnd = Math.min(sourceHunk.lineEnd, targetHunk.lineEnd);

      if (lineStart <= lineEnd) {
        overlaps.push({
          lineStart,
          lineEnd,
          sourceExcerpt: sourceHunk.excerpt,
          targetExcerpt: targetHunk.excerpt,
          overlapLines: lineEnd - lineStart + 1,
        });
      }
    }
  }

  return overlaps.sort((a, b) => b.overlapLines - a.overlapLines);
}

export function classifyConflictKind(input: ConflictDetectionInput): ConflictKind {
  const { sourceDiff, targetDiff, sourceHunks, targetHunks } = input;
  const isAddAdd = sourceDiff.status === 'A' && targetDiff.status === 'A';
  if (isAddAdd) {
    return 'add_add';
  }

  const overlaps = findAllHunkOverlaps(sourceHunks, targetHunks);
  const totalChangedLines = [...sourceHunks, ...targetHunks]
    .reduce((sum, hunk) => sum + (hunk.lineEnd - hunk.lineStart + 1), 0);
  const largeChange = totalChangedLines >= LARGE_HUNK_LINE_THRESHOLD
    || sourceHunks.length + targetHunks.length >= 4;

  if (largeChange) {
    return 'full_file';
  }
  if (overlaps.length > 0) {
    return 'hunk_overlap';
  }
  return 'same_file';
}

export function buildConflictRegions(input: ConflictDetectionInput): MergeConflictRegion[] {
  const overlaps = findAllHunkOverlaps(input.sourceHunks, input.targetHunks);
  const regions: MergeConflictRegion[] = [];

  for (const [index, overlap] of overlaps.slice(0, MAX_REGIONS).entries()) {
    regions.push({
      id: `region_${index}`,
      label: `구간 ${index + 1} (L${overlap.lineStart}–${overlap.lineEnd})`,
      lineStart: overlap.lineStart,
      lineEnd: overlap.lineEnd,
      sourceExcerpt: overlap.sourceExcerpt,
      targetExcerpt: overlap.targetExcerpt,
    });
  }

  if (regions.length >= 2) {
    return regions;
  }

  const sourceHunks = input.sourceHunks.slice(0, MAX_REGIONS);
  const targetHunks = input.targetHunks.slice(0, MAX_REGIONS);
  const pairCount = Math.max(sourceHunks.length, targetHunks.length, 1);

  for (let index = 0; index < Math.min(pairCount, MAX_REGIONS); index += 1) {
    const sourceHunk = sourceHunks[index] ?? sourceHunks[0];
    const targetHunk = targetHunks[index] ?? targetHunks[0];
    if (!sourceHunk && !targetHunk) {
      continue;
    }
    const lineStart = Math.min(sourceHunk?.lineStart ?? targetHunk!.lineStart, targetHunk?.lineStart ?? sourceHunk!.lineStart);
    const lineEnd = Math.max(sourceHunk?.lineEnd ?? targetHunk!.lineEnd, targetHunk?.lineEnd ?? sourceHunk!.lineEnd);
    regions.push({
      id: `region_${index}`,
      label: `구간 ${index + 1} (L${lineStart}–${lineEnd})`,
      lineStart,
      lineEnd,
      sourceExcerpt: sourceHunk?.excerpt,
      targetExcerpt: targetHunk?.excerpt,
    });
  }

  return regions.slice(0, MAX_REGIONS);
}

export function capFileContent(content: string): string {
  if (content.length <= FULL_FILE_CHAR_CAP) {
    return content;
  }
  return `${content.slice(0, FULL_FILE_CHAR_CAP)}\n\n… (truncated, ${content.length - FULL_FILE_CHAR_CAP} chars omitted)`;
}

export async function loadFullFileContents(
  gitService: GitService,
  sourceRef: string,
  targetRef: string,
  mergeBase: string,
  filePath: string,
): Promise<{ sourceFullContent?: string; targetFullContent?: string; baseFullContent?: string }> {
  const [sourceFull, targetFull, baseFull] = await Promise.all([
    gitService.showFileAtRevision(sourceRef, filePath).catch(() => undefined),
    gitService.showFileAtRevision(targetRef, filePath).catch(() => undefined),
    gitService.showFileAtRevision(mergeBase, filePath).catch(() => undefined),
  ]);

  return {
    sourceFullContent: sourceFull != null ? capFileContent(sourceFull) : undefined,
    targetFullContent: targetFull != null ? capFileContent(targetFull) : undefined,
    baseFullContent: baseFull != null ? capFileContent(baseFull) : undefined,
  };
}

export async function enrichConflictFields(
  gitService: GitService,
  input: ConflictDetectionInput,
  sourceRef: string,
  targetRef: string,
  mergeBase: string,
): Promise<EnrichedConflictFields> {
  const conflictKind = classifyConflictKind(input);
  const conflictRegions = buildConflictRegions(input);
  const overlaps = findAllHunkOverlaps(input.sourceHunks, input.targetHunks);
  const primaryRegion = conflictRegions[0];
  const hasLineOverlap = overlaps.length > 0;

  let sourceExcerpt = primaryRegion?.sourceExcerpt ?? input.sourceHunks[0]?.excerpt;
  let targetExcerpt = primaryRegion?.targetExcerpt ?? input.targetHunks[0]?.excerpt;
  let lineStart = primaryRegion?.lineStart ?? input.sourceHunks[0]?.lineStart ?? input.targetHunks[0]?.lineStart ?? 1;
  let lineEnd = primaryRegion?.lineEnd ?? input.sourceHunks[0]?.lineEnd ?? lineStart;

  let sourceFullContent: string | undefined;
  let targetFullContent: string | undefined;
  let baseFullContent: string | undefined;

  if (conflictKind === 'full_file' || conflictKind === 'add_add') {
    const full = await loadFullFileContents(
      gitService,
      sourceRef,
      targetRef,
      mergeBase,
      input.filePath,
    );
    sourceFullContent = full.sourceFullContent;
    targetFullContent = full.targetFullContent;
    baseFullContent = full.baseFullContent;
    if (sourceFullContent) {
      sourceExcerpt = sourceFullContent;
    }
    if (targetFullContent) {
      targetExcerpt = targetFullContent;
    }
    if (sourceFullContent || targetFullContent) {
      const lines = (sourceFullContent ?? targetFullContent ?? '').split('\n');
      lineStart = 1;
      lineEnd = Math.max(1, lines.length);
    }
  }

  return {
    conflictKind,
    conflictRegions,
    lineStart,
    lineEnd,
    sourceExcerpt,
    targetExcerpt,
    hasLineOverlap,
    sourceFullContent,
    targetFullContent,
    baseFullContent,
  };
}
