import type {
  RestoreHistory,
  RestoreHistoryRepository,
} from '@gitcat/shared-types';
import { SnapshotIdGenerator } from './SnapshotIdGenerator';

const DEFAULT_LIMIT = 100;

export class RestoreHistoryQueryService {
  private readonly worktreeInstanceId: string;

  constructor(
    private readonly restoreHistoryRepository: RestoreHistoryRepository,
    workspaceRoot: string,
    worktreeInstanceId?: string,
  ) {
    this.worktreeInstanceId =
      worktreeInstanceId ?? SnapshotIdGenerator.generateWorktreeInstanceId(workspaceRoot);
  }

  async listHistory(limit = DEFAULT_LIMIT): Promise<RestoreHistory[]> {
    const rows = await this.restoreHistoryRepository.listByWorkspace(
      this.worktreeInstanceId,
      limit,
    );

    return rows.map((row) => ({
      restoreId: row.restore_history_id,
      fromSnapshotId: row.from_snapshot_id,
      toSnapshotId: row.target_snapshot_id,
      preRestoreSnapshotId: row.pre_restore_snapshot_id ?? undefined,
      status: row.status,
      restoredAt: row.restored_at,
      failureReason: row.failure_reason ?? undefined,
    }));
  }
}
