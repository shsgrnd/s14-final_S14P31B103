import { WorktreeRepository, WorktreeRow } from '@gitcat/shared-types';
import type { SQLiteDatabase } from '../../client/client';

export class SqliteWorktreeRepository implements WorktreeRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async upsert(worktree: Omit<WorktreeRow, 'created_at' | 'updated_at'>): Promise<WorktreeRow> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO worktrees (
        worktree_id, project_id, worktree_path, is_main, is_active, last_opened_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(worktree_id) DO UPDATE SET
        project_id = excluded.project_id,
        worktree_path = excluded.worktree_path,
        is_main = excluded.is_main,
        is_active = excluded.is_active,
        last_opened_at = excluded.last_opened_at,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      worktree.worktree_id,
      worktree.project_id,
      worktree.worktree_path,
      worktree.is_main,
      worktree.is_active,
      worktree.last_opened_at,
      now,
      now
    );

    return this.findByPath(worktree.worktree_path) as Promise<WorktreeRow>;
  }

  async findByPath(path: string): Promise<WorktreeRow | null> {
    const stmt = this.db.prepare('SELECT * FROM worktrees WHERE worktree_path = ?');
    const row = stmt.get(path);
    return (row as WorktreeRow) || null;
  }

  async listByProject(projectId: string): Promise<WorktreeRow[]> {
    const stmt = this.db.prepare('SELECT * FROM worktrees WHERE project_id = ?');
    return stmt.all(projectId) as WorktreeRow[];
  }
}
