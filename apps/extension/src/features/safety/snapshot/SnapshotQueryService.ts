import type {
  SnapshotDetail,
  SnapshotFile,
  SnapshotHunk,
  SnapshotMeta,
  SnapshotRepository,
  SnapshotFileRepository,
} from '@gitcat/shared-types';
import { LocalStorageImpl } from '../../../adapters/LocalStorageImpl';
import { SnapshotIdGenerator } from './SnapshotIdGenerator';

export interface SnapshotListQueryOptions {
  limit?: number;
  offset?: number;
}

export interface SnapshotListQueryResult {
  snapshots: SnapshotMeta[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface SnapshotFileDiffResult {
  snapshotId: string;
  filePath: string;
  diffText: string;
  file?: SnapshotFile;
  hunks: SnapshotHunk[];
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_SCAN = 1000;

export class SnapshotQueryService {
  private readonly storage: LocalStorageImpl;
  private readonly worktreeInstanceId: string;

  constructor(
    private readonly snapshotRepository: SnapshotRepository,
    private readonly snapshotFileRepository: SnapshotFileRepository,
    private readonly workspaceRoot: string,
    worktreeInstanceId?: string,
  ) {
    this.storage = new LocalStorageImpl(workspaceRoot);
    this.worktreeInstanceId =
      worktreeInstanceId ?? SnapshotIdGenerator.generateWorktreeInstanceId(workspaceRoot);
  }

  async listSnapshots(options: SnapshotListQueryOptions = {}): Promise<SnapshotListQueryResult> {
    const limit = this.normalizeLimit(options.limit);
    const offset = this.normalizeOffset(options.offset);
    const scanLimit = Math.min(offset + limit + 1, MAX_SCAN);
    const rows = await this.snapshotRepository.listByWorkspace(this.worktreeInstanceId, scanLimit);
    const pagedRows = rows.slice(offset, offset + limit);
    const snapshots = await Promise.all(pagedRows.map((row) => this.toSnapshotMeta(row.snapshot_id)));

    return {
      snapshots,
      limit,
      offset,
      hasMore: rows.length > offset + limit,
    };
  }

  async getSnapshotDetail(snapshotId: string): Promise<SnapshotDetail> {
    const meta = await this.toSnapshotMeta(snapshotId);
    const artifact = await this.storage.readSnapshotArtifact(snapshotId);

    return {
      meta,
      manifest: artifact.manifest,
      diffText: artifact.patchText,
      files: artifact.manifest.changedFiles,
      hunks: artifact.hunks,
      warningSummary: this.toWarningSummary(artifact.manifest.warnings),
    } as SnapshotDetail;
  }

  async getSnapshotFiles(snapshotId: string): Promise<SnapshotFile[]> {
    const artifact = await this.storage.readSnapshotArtifact(snapshotId);
    return artifact.manifest.changedFiles;
  }

  async getSnapshotFileDiff(snapshotId: string, filePath: string): Promise<SnapshotFileDiffResult> {
    const normalizedFilePath = filePath.replace(/\\/g, '/');
    const artifact = await this.storage.readSnapshotArtifact(snapshotId);
    const targetFile = artifact.manifest.changedFiles.find((file) => file.filePath === normalizedFilePath);
    const hunks = artifact.hunks.filter((hunk) => hunk.filePath === normalizedFilePath);

    return {
      snapshotId,
      filePath: normalizedFilePath,
      diffText: this.extractFilePatch(artifact.patchText, normalizedFilePath, targetFile),
      file: targetFile,
      hunks,
    };
  }

  private async toSnapshotMeta(snapshotId: string): Promise<SnapshotMeta> {
    const row = await this.snapshotRepository.findById(snapshotId);
    if (!row) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    const fallbackFiles = await this.snapshotFileRepository.listBySnapshotId(snapshotId);

    try {
      const artifact = await this.storage.readSnapshotArtifact(snapshotId);
      return {
        snapshotId: row.snapshot_id,
        sessionId: row.session_id,
        type: row.type,
        status: 'completed',
        createdAt: row.created_at,
        summary: row.summary ?? artifact.manifest.summary,
        reason: row.reason ?? artifact.manifest.reason,
        previousSnapshotId: row.previous_snapshot_id ?? artifact.manifest.previousSnapshotId,
        changedFileCount: artifact.manifest.changedFiles.length,
        warningCount: artifact.manifest.warnings?.length ?? 0,
        warningSummary: this.toWarningSummary(artifact.manifest.warnings),
        localPath: row.local_path ?? undefined,
        files: artifact.manifest.changedFiles.map((file) => ({
          path: file.filePath,
          status: file.status,
          added: file.additions,
          removed: file.deletions,
          additions: file.additions,
          deletions: file.deletions,
          hunkCount: file.hunkCount,
          isBinary: file.isBinary,
          isLargeFile: file.isLargeFile,
          importance: file.importance,
          renamedFrom: file.renamedFrom,
          renamedTo: file.renamedTo,
        })),
      } as SnapshotMeta;
    } catch {
      return {
        snapshotId: row.snapshot_id,
        sessionId: row.session_id,
        type: row.type,
        status: 'completed',
        createdAt: row.created_at,
        summary: row.summary ?? undefined,
        reason: row.reason ?? undefined,
        previousSnapshotId: row.previous_snapshot_id ?? undefined,
        changedFileCount: fallbackFiles.length,
        warningCount: 0,
        warningSummary: ['Snapshot artifact is missing or unreadable.'],
        localPath: row.local_path ?? undefined,
        files: fallbackFiles.map((file) => ({
          path: file.original_path,
          status: 'modified',
        })),
      } as SnapshotMeta;
    }
  }

  private extractFilePatch(patchText: string, filePath: string, file?: SnapshotFile): string {
    if (!patchText) {
      return '';
    }

    const normalizedFilePath = filePath.replace(/\\/g, '/');
    const renamedFrom = file?.renamedFrom?.replace(/\\/g, '/');
    const chunks = patchText
      .split(/^diff --git /m)
      .filter(Boolean)
      .map((chunk) => `diff --git ${chunk}`.trimEnd());

    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      const header = lines[0] ?? '';
      const hasDirectHeader =
        header === `diff --git a/${normalizedFilePath} b/${normalizedFilePath}` ||
        (renamedFrom !== undefined && header === `diff --git a/${renamedFrom} b/${normalizedFilePath}`);
      const hasPathMarker =
        chunk.includes(`\n+++ b/${normalizedFilePath}\n`) ||
        chunk.endsWith(`\n+++ b/${normalizedFilePath}`) ||
        chunk.includes(`\nrename to ${normalizedFilePath}\n`) ||
        chunk.endsWith(`\nrename to ${normalizedFilePath}`);

      if (hasDirectHeader || hasPathMarker) {
        return `${chunk}\n`;
      }
    }

    return '';
  }

  private toWarningSummary(
    warnings: Array<{ message: string }> | undefined,
  ): string[] | undefined {
    if (!warnings || warnings.length === 0) {
      return undefined;
    }

    return warnings.map((warning) => warning.message);
  }

  private normalizeLimit(limit: number | undefined): number {
    if (limit === undefined) {
      return DEFAULT_LIMIT;
    }

    return Math.min(Math.max(limit, 1), MAX_LIMIT);
  }

  private normalizeOffset(offset: number | undefined): number {
    return offset === undefined ? 0 : Math.max(offset, 0);
  }
}
