import { Database } from 'better-sqlite3';
import { BranchRepository } from '@gitcat/shared-types';
import { BranchRow } from '@gitcat/shared-types';

export class SqliteBranchRepository implements BranchRepository {
  constructor(private readonly db: Database) {}

  async upsert(branch: Omit<BranchRow, 'created_at' | 'updated_at'>): Promise<BranchRow> {
    const now = new Date().toISOString();
    
    // 논리적 식별자인 (project_id, branch_name)을 기준으로 UPSERT를 수행합니다.
    const stmt = this.db.prepare(`
      INSERT INTO branches (
        branch_id, project_id, branch_name, is_remote, tracking_branch_name, last_commit_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, branch_name) DO UPDATE SET
        is_remote = excluded.is_remote,
        tracking_branch_name = excluded.tracking_branch_name,
        last_commit_hash = excluded.last_commit_hash,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      branch.branch_id,
      branch.project_id,
      branch.branch_name,
      branch.is_remote,
      branch.tracking_branch_name,
      branch.last_commit_hash,
      now, // created_at (will be ignored by DO UPDATE if conflict)
      now  // updated_at
    );

    return this.findByProjectAndName(branch.project_id, branch.branch_name) as Promise<BranchRow>;
  }

  async findByProjectAndName(projectId: string, branchName: string): Promise<BranchRow | null> {
    const stmt = this.db.prepare('SELECT * FROM branches WHERE project_id = ? AND branch_name = ?');
    const row = stmt.get(projectId, branchName);
    return (row as BranchRow) || null;
  }

  async listByProject(projectId: string): Promise<BranchRow[]> {
    const stmt = this.db.prepare('SELECT * FROM branches WHERE project_id = ?');
    return stmt.all(projectId) as BranchRow[];
  }

  async deleteByProjectAndName(projectId: string, branchName: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM branches WHERE project_id = ? AND branch_name = ?');
    stmt.run(projectId, branchName);
  }
}
