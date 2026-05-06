import { RecommendationHistoryRepository, CreateRecommendationHistoryInput } from '@gitcat/shared-types';
import { RecommendationHistoryRow } from '@gitcat/shared-types';
import type { SQLiteDatabase } from '../../client/client';
import { randomUUID } from 'crypto';

export class SqliteRecommendationHistoryRepository implements RecommendationHistoryRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async insert(input: CreateRecommendationHistoryInput): Promise<RecommendationHistoryRow> {
    const now = new Date().toISOString();
    const recommendationId = `rec_${randomUUID()}`;

    const stmt = this.db.prepare(`
      INSERT INTO recommendation_histories (
        recommendation_id, project_id, session_id, ai_request_id, recommendation_type,
        input_summary, result_text, alternative_texts_json, generation_basis_summary, followup_notes, warnings_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      recommendationId,
      input.project_id,
      input.session_id || null,
      input.ai_request_id || null,
      input.recommendation_type,
      input.input_summary || null,
      input.result_text,
      input.alternative_texts ? JSON.stringify(input.alternative_texts) : null,
      input.generation_basis_summary || null,
      input.followup_notes || null,
      input.warnings ? JSON.stringify(input.warnings) : null,
      now
    );

    return this.findById(recommendationId) as Promise<RecommendationHistoryRow>;
  }

  async findById(recommendationId: string): Promise<RecommendationHistoryRow | null> {
    const stmt = this.db.prepare('SELECT * FROM recommendation_histories WHERE recommendation_id = ?');
    const row = stmt.get(recommendationId) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  async listByProject(projectId: string, limit = 50): Promise<RecommendationHistoryRow[]> {
    const stmt = this.db.prepare('SELECT * FROM recommendation_histories WHERE project_id = ? ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(projectId, limit) as any[];
    return rows.map(this.mapRow);
  }

  async listRecentByType(
    projectId: string,
    type: RecommendationHistoryRow['recommendation_type'],
    limit = 10,
  ): Promise<RecommendationHistoryRow[]> {
    const stmt = this.db.prepare('SELECT * FROM recommendation_histories WHERE project_id = ? AND recommendation_type = ? ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(projectId, type, limit) as any[];
    return rows.map(this.mapRow);
  }

  private mapRow(row: any): RecommendationHistoryRow {
    return {
      ...row,
      alternative_texts_json: row.alternative_texts_json ?? null,
      warnings_json: row.warnings_json ?? null,
    };
  }
}
