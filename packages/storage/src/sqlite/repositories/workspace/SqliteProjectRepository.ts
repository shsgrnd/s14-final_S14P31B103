import { ProjectRepository, ProjectRow } from '@gitcat/shared-types';
import type { SQLiteDatabase } from '../../client/client';

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async insert(project: Omit<ProjectRow, 'created_at' | 'updated_at'>): Promise<ProjectRow> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO projects (project_id, user_id, project_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(project.project_id, project.user_id, project.project_name, now, now);
    
    return this.findById(project.project_id) as Promise<ProjectRow>;
  }

  async findById(projectId: string): Promise<ProjectRow | null> {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE project_id = ?');
    const row = stmt.get(projectId);
    return (row as ProjectRow) || null;
  }

  async findByUserId(userId: string): Promise<ProjectRow[]> {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE user_id = ?');
    return stmt.all(userId) as ProjectRow[];
  }
}
