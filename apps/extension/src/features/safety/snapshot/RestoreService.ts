import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  RestoreHistory,
  RestoreHistoryRepository,
  SnapshotFile,
  SnapshotManifest,
  SnapshotRepository,
  SnapshotRow,
} from '@gitcat/shared-types';
import { LocalStorageImpl } from '../../../adapters/LocalStorageImpl';
import type { ISnapshotService } from './ISnapshotService';
import { SnapshotIdGenerator } from './SnapshotIdGenerator';

const MAX_SNAPSHOTS = 1000;

export interface RestoreSnapshotResult {
  snapshotId: string;
  preRestoreSnapshotId?: string;
  changedPaths: string[];
  restoreHistory: RestoreHistory;
}

interface ApplyWorkspaceStateResult {
  appliedPaths: string[];
  failedPaths: Array<{ path: string; reason: string }>;
}

export class RestoreService {
  private readonly storage: LocalStorageImpl;
  private readonly workspaceRoot: string;
  private isRestoring = false;

  constructor(
    private readonly snapshotRepository: SnapshotRepository,
    private readonly restoreHistoryRepository: RestoreHistoryRepository,
    private readonly snapshotService: ISnapshotService,
    workspaceRoot: string,
  ) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.storage = new LocalStorageImpl(this.workspaceRoot);
  }

  async restoreToSnapshot(snapshotId: string): Promise<RestoreSnapshotResult> {
    if (this.isRestoring) {
      throw new Error('Already restoring a snapshot. Please wait for the current operation to complete.');
    }

    this.snapshotService.beginRestoreOperation();
    this.isRestoring = true;

    try {
      const snapshots = await this.listSnapshotsOldestFirst();
      const targetIndex = snapshots.findIndex((row) => row.snapshot_id === snapshotId);
      if (targetIndex < 0) {
        throw new Error(`Snapshot not found: ${snapshotId}`);
      }

      const manifests = new Map<string, SnapshotManifest>();
      const candidatePaths = await this.collectCandidatePaths(snapshots, manifests);
      const desiredStates = new Map<string, Uint8Array | null>();
      const currentStates = new Map<string, Uint8Array | null>();

      for (const candidatePath of candidatePaths) {
        const desiredState = await this.resolveTargetState(
          candidatePath,
          snapshots,
          manifests,
          targetIndex,
        );
        desiredStates.set(candidatePath, desiredState);
        currentStates.set(candidatePath, await this.readWorkspaceFile(candidatePath));
      }

      const changedPaths = [...candidatePaths].filter((candidatePath) =>
        !this.areEqualBytes(
          desiredStates.get(candidatePath) ?? null,
          currentStates.get(candidatePath) ?? null,
        ),
      );

      const latestSnapshotId = snapshots.at(-1)?.snapshot_id;
      const fromSnapshotId = latestSnapshotId ?? snapshotId;
      let preRestoreSnapshotId: string | undefined;

      try {
        preRestoreSnapshotId = await this.createPreRestoreSnapshot(
          snapshotId,
          changedPaths,
          currentStates,
        );
        const applyResult = await this.applyWorkspaceState(changedPaths, desiredStates);
        if (applyResult.failedPaths.length > 0) {
          const failureSummary = this.buildApplyFailureSummary(applyResult);
          const historyRow = await this.restoreHistoryRepository.create({
            restore_history_id: `restore_${Date.now()}`,
            from_snapshot_id: fromSnapshotId,
            target_snapshot_id: snapshotId,
            pre_restore_snapshot_id: preRestoreSnapshotId ?? null,
            status: applyResult.appliedPaths.length > 0 ? 'partial' : 'failed',
            failure_reason: failureSummary,
          });
          throw new Error(`Restore finished with partial failure: ${historyRow.failure_reason}`);
        }

        const historyRow = await this.restoreHistoryRepository.create({
          restore_history_id: `restore_${Date.now()}`,
          from_snapshot_id: fromSnapshotId,
          target_snapshot_id: snapshotId,
          pre_restore_snapshot_id: preRestoreSnapshotId ?? null,
          status: 'success',
        });

        return {
          snapshotId,
          preRestoreSnapshotId,
          changedPaths,
          restoreHistory: this.toRestoreHistory(historyRow),
        };
      } catch (error) {
        const failureReason = error instanceof Error ? error.message : String(error);
        if (failureReason.startsWith('Restore finished with partial failure:')) {
          throw error;
        }

        const historyRow = await this.restoreHistoryRepository.create({
          restore_history_id: `restore_${Date.now()}`,
          from_snapshot_id: fromSnapshotId,
          target_snapshot_id: snapshotId,
          pre_restore_snapshot_id: preRestoreSnapshotId ?? null,
          status: 'failed',
          failure_reason: failureReason,
        });

        throw new Error(`Restore failed: ${historyRow.failure_reason ?? failureReason}`);
      }
    } finally {
      this.isRestoring = false;
      this.snapshotService.endRestoreOperation();
    }
  }

  private async createPreRestoreSnapshot(
    targetSnapshotId: string,
    changedPaths: string[],
    currentStates: Map<string, Uint8Array | null>,
  ): Promise<string | undefined> {
    const baselines = new Map<string, Uint8Array>();
    for (const changedPath of changedPaths) {
      const currentState = currentStates.get(changedPath) ?? null;
      if (currentState === null) {
        continue;
      }
      baselines.set(changedPath, currentState);
    }

    const preRestoreSnapshotId = await this.snapshotService.createSnapshot('pre_restore', {
      force: true,
      reason: `Automatic safety snapshot before restoring to ${targetSnapshotId}`,
      summary: `Pre-restore backup for ${targetSnapshotId}`,
      changedFiles: changedPaths,
      baselines,
    });

    if (!preRestoreSnapshotId) {
      throw new Error('Failed to create pre_restore snapshot before workspace restore.');
    }

    return preRestoreSnapshotId;
  }

  private async listSnapshotsOldestFirst(): Promise<SnapshotRow[]> {
    const rows = await this.snapshotRepository.listByWorkspace(
      this.getWorktreeInstanceId(),
      MAX_SNAPSHOTS,
    );
    return [...rows].reverse();
  }

  private async collectCandidatePaths(
    snapshots: SnapshotRow[],
    manifests: Map<string, SnapshotManifest>,
  ): Promise<Set<string>> {
    const candidatePaths = await this.collectWorkspacePaths();

    for (const snapshot of snapshots) {
      const manifest = await this.getManifest(snapshot.snapshot_id, manifests);
      for (const changedFile of manifest.changedFiles) {
        candidatePaths.add(this.normalizeRelativePath(changedFile.filePath));
        if (changedFile.renamedFrom) {
          candidatePaths.add(this.normalizeRelativePath(changedFile.renamedFrom));
        }
      }
    }

    return candidatePaths;
  }

  private async resolveTargetState(
    filePath: string,
    snapshots: SnapshotRow[],
    manifests: Map<string, SnapshotManifest>,
    targetIndex: number,
  ): Promise<Uint8Array | null> {
    let wasTouchedByAnySnapshot = false;

    for (let index = targetIndex; index >= 0; index -= 1) {
      const manifest = await this.getManifest(snapshots[index].snapshot_id, manifests);
      const touchedFile = this.findTouchedFile(manifest, filePath);
      if (!touchedFile) {
        continue;
      }
      wasTouchedByAnySnapshot = true;

      const state = await this.readSnapshotState(
        snapshots[index].snapshot_id,
        touchedFile,
        filePath,
        'after',
      );
      if (state !== undefined) {
        return state;
      }
    }

    for (let index = targetIndex + 1; index < snapshots.length; index += 1) {
      const manifest = await this.getManifest(snapshots[index].snapshot_id, manifests);
      const touchedFile = this.findTouchedFile(manifest, filePath);
      if (!touchedFile) {
        continue;
      }
      wasTouchedByAnySnapshot = true;

      const state = await this.readSnapshotState(
        snapshots[index].snapshot_id,
        touchedFile,
        filePath,
        'before',
      );
      if (state !== undefined) {
        return state;
      }
    }

    if (wasTouchedByAnySnapshot) {
      throw new Error(
        `Full backup state is missing for "${filePath}". ` +
        'Restore aborted to avoid reconstructing an unreliable state from patch hunks only.',
      );
    }

    return this.readWorkspaceFile(filePath);
  }

  private async readSnapshotState(
    snapshotId: string,
    changedFile: SnapshotFile,
    filePath: string,
    stage: 'before' | 'after',
  ): Promise<Uint8Array | null | undefined> {
    const normalizedPath = this.normalizeRelativePath(filePath);
    const isRenamedFrom = changedFile.renamedFrom !== undefined
      && this.normalizeRelativePath(changedFile.renamedFrom) === normalizedPath;
    const isPrimaryPath = this.normalizeRelativePath(changedFile.filePath) === normalizedPath;

    if (stage === 'after') {
      if (isRenamedFrom) {
        return null;
      }
      if (!isPrimaryPath) {
        return undefined;
      }
      if (changedFile.status === 'deleted') {
        return null;
      }

      const backup = await this.storage.readFullSnapshotFile(snapshotId, 'after', normalizedPath);
      if (backup !== undefined) {
        return backup;
      }
      return undefined;
    }

    if (isRenamedFrom) {
      const beforeBackup = await this.storage.readFullSnapshotFile(
        snapshotId,
        'before',
        normalizedPath,
      );
      if (beforeBackup !== undefined) {
        return beforeBackup;
      }
      if (changedFile.status === 'renamed') {
        const afterBackup = await this.storage.readFullSnapshotFile(
          snapshotId,
          'after',
          this.normalizeRelativePath(changedFile.filePath),
        );
        if (afterBackup !== undefined) {
          return afterBackup;
        }
      }
      return undefined;
    }

    if (!isPrimaryPath) {
      return undefined;
    }
    if (changedFile.status === 'added') {
      return null;
    }

    const backup = await this.storage.readFullSnapshotFile(snapshotId, 'before', normalizedPath);
    if (backup !== undefined) {
      return backup;
    }
    return undefined;
  }

  private findTouchedFile(
    manifest: SnapshotManifest,
    filePath: string,
  ): SnapshotFile | undefined {
    const normalizedPath = this.normalizeRelativePath(filePath);
    return manifest.changedFiles.find((changedFile) => {
      if (this.normalizeRelativePath(changedFile.filePath) === normalizedPath) {
        return true;
      }
      return changedFile.renamedFrom !== undefined
        && this.normalizeRelativePath(changedFile.renamedFrom) === normalizedPath;
    });
  }

  private async getManifest(
    snapshotId: string,
    manifests: Map<string, SnapshotManifest>,
  ): Promise<SnapshotManifest> {
    const cached = manifests.get(snapshotId);
    if (cached) {
      return cached;
    }

    const manifest = await this.storage.readSnapshotManifest(snapshotId);
    manifests.set(snapshotId, manifest);
    return manifest;
  }

  private async applyWorkspaceState(
    changedPaths: string[],
    desiredStates: Map<string, Uint8Array | null>,
  ): Promise<ApplyWorkspaceStateResult> {
    const appliedPaths: string[] = [];
    const failedPaths: Array<{ path: string; reason: string }> = [];

    for (const changedPath of changedPaths) {
      try {
        const desiredState = desiredStates.get(changedPath) ?? null;
        const absolutePath = path.resolve(this.workspaceRoot, changedPath);
        this.assertInsideWorkspace(absolutePath);

        if (desiredState === null) {
          await fs.rm(absolutePath, { force: true });
          await this.removeEmptyParentDirectories(path.dirname(absolutePath));
        } else {
          await fs.mkdir(path.dirname(absolutePath), { recursive: true });
          await fs.writeFile(absolutePath, Buffer.from(desiredState));
        }

        appliedPaths.push(changedPath);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failedPaths.push({ path: changedPath, reason });
      }
    }

    return { appliedPaths, failedPaths };
  }

  private buildApplyFailureSummary(result: ApplyWorkspaceStateResult): string {
    const maxDetails = 5;
    const details = result.failedPaths
      .slice(0, maxDetails)
      .map((entry) => `${entry.path}: ${entry.reason}`)
      .join(' | ');
    const extraCount = Math.max(0, result.failedPaths.length - maxDetails);
    const suffix = extraCount > 0 ? ` | ...and ${extraCount} more failures` : '';
    return (
      `Applied ${result.appliedPaths.length} path(s), ` +
      `failed ${result.failedPaths.length} path(s)` +
      (details ? ` | ${details}${suffix}` : '')
    );
  }

  private async collectWorkspacePaths(): Promise<Set<string>> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.find(
      (folder) => path.resolve(folder.uri.fsPath) === this.workspaceRoot,
    );
    if (!workspaceFolder) {
      throw new Error(`Workspace folder not found for restore root: ${this.workspaceRoot}`);
    }

    const exclude = '{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/.vscode/gitcat/**}';
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, '**/*'),
      exclude,
    );

    const result = new Set<string>();
    for (const file of files) {
      result.add(this.normalizeRelativePath(file.fsPath));
    }
    return result;
  }

  private async readWorkspaceFile(filePath: string): Promise<Uint8Array | null> {
    const absolutePath = path.resolve(this.workspaceRoot, filePath);
    this.assertInsideWorkspace(absolutePath);

    try {
      return await fs.readFile(absolutePath);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private async removeEmptyParentDirectories(directoryPath: string): Promise<void> {
    let currentPath = directoryPath;
    while (currentPath.startsWith(this.workspaceRoot) && currentPath !== this.workspaceRoot) {
      try {
        const remaining = await fs.readdir(currentPath);
        if (remaining.length > 0) {
          return;
        }
        await fs.rmdir(currentPath);
      } catch {
        return;
      }
      currentPath = path.dirname(currentPath);
    }
  }

  private areEqualBytes(left: Uint8Array | null, right: Uint8Array | null): boolean {
    if (left === null || right === null) {
      return left === right;
    }
    if (left.byteLength !== right.byteLength) {
      return false;
    }
    for (let index = 0; index < left.byteLength; index += 1) {
      if (left[index] !== right[index]) {
        return false;
      }
    }
    return true;
  }

  private normalizeRelativePath(filePath: string): string {
    return this.storage.toWorkspaceRelativePath(filePath);
  }

  private assertInsideWorkspace(absolutePath: string): void {
    const relative = path.relative(this.workspaceRoot, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Workspace restore path escaped project root: ${absolutePath}`);
    }
  }

  private getWorktreeInstanceId(): string {
    return SnapshotIdGenerator.generateWorktreeInstanceId(this.workspaceRoot);
  }

  private toRestoreHistory(row: {
    restore_history_id: string;
    from_snapshot_id: string;
    target_snapshot_id: string;
    pre_restore_snapshot_id: string | null;
    status: 'success' | 'failed' | 'partial';
    restored_at: string;
    failure_reason: string | null;
  }): RestoreHistory {
    return {
      restoreId: row.restore_history_id,
      fromSnapshotId: row.from_snapshot_id,
      toSnapshotId: row.target_snapshot_id,
      preRestoreSnapshotId: row.pre_restore_snapshot_id ?? undefined,
      status: row.status,
      restoredAt: row.restored_at,
      failureReason: row.failure_reason ?? undefined,
    };
  }
}
