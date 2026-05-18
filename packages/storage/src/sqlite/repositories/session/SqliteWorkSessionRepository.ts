import type {
  CreateWorkSessionInput,
  WorkSessionRepository,
  WorkSessionRow,
} from '@gitcat/shared-types';
import type { SQLiteDatabase } from '../../client/client';

export class SqliteWorkSessionRepository implements WorkSessionRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async create(input: CreateWorkSessionInput): Promise<WorkSessionRow> {
    const startedAt = input.started_at ?? new Date().toISOString();
    const status = input.status ?? 'active';
    const stmt = this.db.prepare(`
      INSERT INTO work_sessions (
        session_id,
        worktree_instance_id,
        session_type,
        base_snapshot_id,
        description,
        status,
        started_at,
        ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.session_id,
      input.worktree_instance_id,
      input.session_type,
      input.base_snapshot_id ?? null,
      input.description ?? null,
      status,
      startedAt,
      null,
    );

    const row = await this.findById(input.session_id);
    if (!row) {
      throw new Error(`work_sessions row was not created: ${input.session_id}`);
    }

    return row;
  }

  async findById(sessionId: string): Promise<WorkSessionRow | null> {
    const stmt = this.db.prepare('SELECT * FROM work_sessions WHERE session_id = ?');
    return (stmt.get(sessionId) as WorkSessionRow | undefined) ?? null;
  }

  async findActive(
    worktreeInstanceId: string,
    sessionType?: WorkSessionRow['session_type'],
  ): Promise<WorkSessionRow | null> {
    const typeFilter = sessionType ? 'AND session_type = ?' : '';
    const stmt = this.db.prepare(`
      SELECT *
      FROM work_sessions
      WHERE worktree_instance_id = ?
        AND status = 'active'
        ${typeFilter}
      ORDER BY started_at DESC
      LIMIT 1
    `);
    const row = sessionType
      ? stmt.get(worktreeInstanceId, sessionType)
      : stmt.get(worktreeInstanceId);

    return (row as WorkSessionRow | undefined) ?? null;
  }

  async complete(sessionId: string, endedAt = new Date().toISOString()): Promise<WorkSessionRow | null> {
    return this.updateStatus(sessionId, 'completed', endedAt);
  }

  async updateStatus(
    sessionId: string,
    status: WorkSessionRow['status'],
    endedAt?: string | null,
  ): Promise<WorkSessionRow | null> {
    const shouldSetEndedAt = endedAt !== undefined;
    const stmt = this.db.prepare(`
      UPDATE work_sessions
      SET status = ?${shouldSetEndedAt ? ', ended_at = ?' : ''}
      WHERE session_id = ?
    `);

    if (shouldSetEndedAt) {
      stmt.run(status, endedAt ?? null, sessionId);
    } else {
      stmt.run(status, sessionId);
    }

    return this.findById(sessionId);
  }

  async deleteById(sessionId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM work_sessions WHERE session_id = ?');
    stmt.run(sessionId);
  }
}
