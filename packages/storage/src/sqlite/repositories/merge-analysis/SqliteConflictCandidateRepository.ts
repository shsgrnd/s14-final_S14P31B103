import type {
  ConflictCandidateRepository,
  ConflictCandidateRow,
} from '@gitcat/shared-types';
import type { SQLiteDatabase } from '../../client/client';

/**
 * conflict_candidates 테이블의 SQLite 저장소입니다.
 *
 * DB에는 후보의 식별자, 위치, 탐지 방식, 신뢰도만 저장합니다.
 * 코드 본문과 상세 분석 원문은 analysis.json artifact에 저장합니다.
 */
export class SqliteConflictCandidateRepository implements ConflictCandidateRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  /**
   * 한 분석에 속한 충돌 후보들을 트랜잭션으로 저장합니다.
   */
  async insertMany(
    candidates: Array<Omit<ConflictCandidateRow, 'created_at'> & { created_at?: string }>,
  ): Promise<void> {
    if (candidates.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO conflict_candidates (
        candidate_id,
        analysis_id,
        file_path,
        line_start,
        line_end,
        detected_by,
        confidence_score,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction(
      (items: Array<Omit<ConflictCandidateRow, 'created_at'> & { created_at?: string }>) => {
        for (const item of items) {
          stmt.run(
            item.candidate_id,
            item.analysis_id,
            item.file_path,
            item.line_start ?? null,
            item.line_end ?? null,
            item.detected_by,
            item.confidence_score ?? null,
            item.created_at ?? now,
          );
        }
      },
    );

    insertMany(candidates);
  }

  /**
   * analysis_id 기준으로 충돌 후보 목록을 생성 순서대로 조회합니다.
   */
  async listByAnalysis(analysisId: string): Promise<ConflictCandidateRow[]> {
    const stmt = this.db.prepare(`
      SELECT *
      FROM conflict_candidates
      WHERE analysis_id = ?
      ORDER BY created_at ASC
    `);

    return stmt.all(analysisId) as ConflictCandidateRow[];
  }

  async deleteByAnalysis(analysisId: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM conflict_candidates
      WHERE analysis_id = ?
    `);
    stmt.run(analysisId);
  }
}
