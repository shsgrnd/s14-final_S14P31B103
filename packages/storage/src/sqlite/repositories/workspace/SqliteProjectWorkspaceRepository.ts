import { ProjectWorkspaceRepository, ProjectWorkspaceRow } from '@gitcat/shared-types';
import type { SQLiteDatabase } from '../../client/client';

export class SqliteProjectWorkspaceRepository implements ProjectWorkspaceRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async insert(workspace: Omit<ProjectWorkspaceRow, 'created_at' | 'updated_at'>): Promise<ProjectWorkspaceRow> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO project_workspaces (
        project_workspace_id, device_id, project_id, workspace_root_path, git_root_path, last_opened_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      workspace.project_workspace_id,
      workspace.device_id,
      workspace.project_id,
      workspace.workspace_root_path,
      workspace.git_root_path,
      workspace.last_opened_at,
      now,
      now
    );

    return this.findByPath(workspace.workspace_root_path) as Promise<ProjectWorkspaceRow>;
  }

  async findByPath(workspaceRootPath: string): Promise<ProjectWorkspaceRow | null> {
    const stmt = this.db.prepare('SELECT * FROM project_workspaces WHERE workspace_root_path = ?');
    const row = stmt.get(workspaceRootPath);
    return (row as ProjectWorkspaceRow) || null;
  }

  async listByProject(projectId: string): Promise<ProjectWorkspaceRow[]> {
    const stmt = this.db.prepare('SELECT * FROM project_workspaces WHERE project_id = ?');
    return stmt.all(projectId) as ProjectWorkspaceRow[];
  }
}
