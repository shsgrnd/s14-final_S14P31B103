import type {
  CreateSnapshotInput,
  SnapshotRepository,
  SnapshotRow,
} from '@gitcat/shared-types';
import type { SQLiteDatabase } from '../../client/client';

export class SqliteSnapshotRepository implements SnapshotRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async create(input: CreateSnapshotInput): Promise<SnapshotRow> {
    const createdAt = input.created_at ?? new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO snapshots (
        snapshot_id,
        session_id,
        type,
        previous_snapshot_id,
        reason,
        summary,
        local_path,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.snapshot_id,
      input.session_id,
      input.type,
      input.previous_snapshot_id ?? null,
      input.reason ?? null,
      input.summary ?? null,
      input.local_path ?? null,
      createdAt,
    );

    const row = await this.findById(input.snapshot_id);
    if (!row) {
      throw new Error(`snapshots row was not created: ${input.snapshot_id}`);
    }

    return row;
  }

  async findById(snapshotId: string): Promise<SnapshotRow | null> {
    const stmt = this.db.prepare('SELECT * FROM snapshots WHERE snapshot_id = ?');
    return this.mapRow(stmt.get(snapshotId));
  }

  async findLatestBySession(sessionId: string): Promise<SnapshotRow | null> {
    const stmt = this.db.prepare(`
      SELECT *
      FROM snapshots
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return this.mapRow(stmt.get(sessionId));
  }

  async findLatestByWorktreeInstance(worktreeInstanceId: string): Promise<SnapshotRow | null> {
    const stmt = this.db.prepare(`
      SELECT s.*
      FROM snapshots s
      JOIN work_sessions ws ON ws.session_id = s.session_id
      WHERE ws.worktree_instance_id = ?
      ORDER BY s.created_at DESC
      LIMIT 1
    `);

    return this.mapRow(stmt.get(worktreeInstanceId));
  }

  async listRecent(limit = 50): Promise<SnapshotRow[]> {
    const stmt = this.db.prepare(`
      SELECT *
      FROM snapshots
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return this.mapRows(stmt.all(limit));
  }

  async listByWorkspace(worktreeInstanceId: string, limit = 100): Promise<SnapshotRow[]> {
    const stmt = this.db.prepare(`
      SELECT s.*
      FROM snapshots s
      JOIN work_sessions ws ON ws.session_id = s.session_id
      WHERE ws.worktree_instance_id = ?
      ORDER BY s.created_at DESC
      LIMIT ?
    `);

    return this.mapRows(stmt.all(worktreeInstanceId, limit));
  }

  /**
   * 자동 삭제 후보를 조회한다.
   * 최근 keepRecent개를 초과하는 오래된 스냅샷을 오래된 순으로 반환한다.
   */
  async listAutoDeletionCandidates(
    worktreeInstanceId: string,
    keepRecent = 30,
    limit = 100,
  ): Promise<SnapshotRow[]> {
    const stmt = this.db.prepare(`
      SELECT *
      FROM (
        SELECT
          s.*,
          ROW_NUMBER() OVER (ORDER BY s.created_at DESC) AS recency_rank
        FROM snapshots s
        JOIN work_sessions ws ON ws.session_id = s.session_id
        WHERE ws.worktree_instance_id = ?
      )
      WHERE recency_rank > ?
      ORDER BY created_at ASC
      LIMIT ?
    `);

    return this.mapRows(stmt.all(worktreeInstanceId, keepRecent, limit));
  }

  async deleteById(snapshotId: string): Promise<void> {
    const detachPreviousSnapshotLinks = this.db.prepare(`
      UPDATE snapshots
      SET previous_snapshot_id = NULL
      WHERE previous_snapshot_id = ?
    `);
    const deleteRestoreHistories = this.db.prepare(`
      DELETE FROM restore_histories
      WHERE target_snapshot_id = ?
         OR pre_restore_snapshot_id = ?
    `);
    const deleteSnapshotFiles = this.db.prepare('DELETE FROM snapshot_files WHERE snapshot_id = ?');
    const deleteSnapshot = this.db.prepare('DELETE FROM snapshots WHERE snapshot_id = ?');
    const deleteInTransaction = this.db.transaction((id: string) => {
      detachPreviousSnapshotLinks.run(id);
      deleteRestoreHistories.run(id, id);
      deleteSnapshotFiles.run(id);
      deleteSnapshot.run(id);
    });

    deleteInTransaction(snapshotId);
  }

  private mapRows(rows: Array<Record<string, unknown>>): SnapshotRow[] {
    return rows.map((row) => this.mapRow(row)).filter((row): row is SnapshotRow => row !== null);
  }

  private mapRow(row: Record<string, unknown> | undefined): SnapshotRow | null {
    if (!row) {
      return null;
    }

    return {
      snapshot_id: row.snapshot_id as string,
      session_id: row.session_id as string,
      type: row.type as SnapshotRow['type'],
      previous_snapshot_id: (row.previous_snapshot_id as string | null | undefined) ?? null,
      reason: (row.reason as string | null | undefined) ?? null,
      summary: (row.summary as string | null | undefined) ?? null,
      local_path: (row.local_path as string | null | undefined) ?? null,
      created_at: row.created_at as string,
    };
  }
}
