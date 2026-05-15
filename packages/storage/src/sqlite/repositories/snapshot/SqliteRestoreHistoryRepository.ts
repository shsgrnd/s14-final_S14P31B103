import type {
  CreateRestoreHistoryInput,
  RestoreHistoryRepository,
  RestoreHistoryRow,
} from '@gitcat/shared-types';
import type { SQLiteDatabase } from '../../client/client';

export class SqliteRestoreHistoryRepository implements RestoreHistoryRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async create(input: CreateRestoreHistoryInput): Promise<RestoreHistoryRow> {
    const restoredAt = input.restored_at ?? new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO restore_histories (
        restore_history_id,
        from_snapshot_id,
        target_snapshot_id,
        pre_restore_snapshot_id,
        status,
        failure_reason,
        safety_warnings_before_json,
        safety_warnings_after_json,
        restored_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.restore_history_id,
      input.from_snapshot_id,
      input.target_snapshot_id,
      input.pre_restore_snapshot_id ?? null,
      input.status ?? 'success',
      input.failure_reason ?? null,
      input.safety_warnings_before_json ?? null,
      input.safety_warnings_after_json ?? null,
      restoredAt,
    );

    const row = await this.findById(input.restore_history_id);
    if (!row) {
      throw new Error(`restore_histories row was not created: ${input.restore_history_id}`);
    }

    return row;
  }

  async findById(restoreHistoryId: string): Promise<RestoreHistoryRow | null> {
    const stmt = this.db.prepare('SELECT * FROM restore_histories WHERE restore_history_id = ?');
    return (stmt.get(restoreHistoryId) as RestoreHistoryRow | undefined) ?? null;
  }

  async listByWorkspace(worktreeInstanceId: string, limit = 100): Promise<RestoreHistoryRow[]> {
    const stmt = this.db.prepare(`
      SELECT rh.*
      FROM restore_histories rh
      JOIN snapshots s ON s.snapshot_id = rh.target_snapshot_id
      JOIN work_sessions ws ON ws.session_id = s.session_id
      WHERE ws.worktree_instance_id = ?
      ORDER BY rh.restored_at DESC
      LIMIT ?
    `);

    return stmt.all(worktreeInstanceId, limit) as RestoreHistoryRow[];
  }

  async listBySnapshotId(snapshotId: string, limit = 100): Promise<RestoreHistoryRow[]> {
    const stmt = this.db.prepare(`
      SELECT *
      FROM restore_histories
      WHERE target_snapshot_id = ?
         OR pre_restore_snapshot_id = ?
      ORDER BY restored_at DESC
      LIMIT ?
    `);

    return stmt.all(snapshotId, snapshotId, limit) as RestoreHistoryRow[];
  }

  async deleteById(restoreHistoryId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM restore_histories WHERE restore_history_id = ?');
    stmt.run(restoreHistoryId);
  }
}
