/**
 * SqliteRecommendationHistoryRepository — recommendation_histories SQLite 구현체
 *
 * recommendation_histories 테이블의 CRUD를 담당한다.
 * 모든 조회 결과는 RecommendationHistoryRow 타입으로 반환된다.
 *
 * DB 컬럼 <-> Row 타입 매핑 주의사항:
 * - DB: alternative_texts_json (TEXT, JSON 직렬화된 문자열)
 *   Row: alternative_texts_json (string | null) — 호출자가 파싱 책임
 *   단, mapRow()에서 alternative_texts (string[]) 로 역직렬화해 내보낸다.
 *   (RecommendationHistoryRow 스키마에 alternative_texts_json 필드가 있으므로
 *    조회 후 파싱된 값은 별도로 사용하거나, toContext() 단계에서 가공한다.)
 * - DB: warnings_json (TEXT, JSON 직렬화된 문자열)
 *   Row: warnings_json (string | null) — 동일 처리
 */

import type {
  RecommendationHistoryRepository,
  CreateRecommendationHistoryInput,
} from '@gitcat/shared-types';
import type { RecommendationHistoryRow } from '@gitcat/shared-types';
import type { SQLiteDatabase } from '../../client/client';
import { randomUUID } from 'crypto';

export class SqliteRecommendationHistoryRepository implements RecommendationHistoryRepository {
  constructor(private readonly db: SQLiteDatabase) { }

  /**
   * 추천 이력을 recommendation_histories 테이블에 저장하고,
   * 저장된 row를 즉시 조회해 반환한다.
   */
  async insert(input: CreateRecommendationHistoryInput): Promise<RecommendationHistoryRow> {
    const now = new Date().toISOString();
    const recommendationId = `rec_${randomUUID()}`;

    const stmt = this.db.prepare(`
      INSERT INTO recommendation_histories (
        recommendation_id, project_id, session_id, ai_request_id, recommendation_type,
        input_summary, result_text, alternative_texts_json, generation_basis_summary,
        followup_notes, warnings_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      recommendationId,
      input.project_id,
      // 빈 문자열('')도 NULL로 저장하기 위해 nullish(??) 대신 falsy(||) 체크를 사용한다
      input.session_id || null,
      input.ai_request_id || null,
      input.recommendation_type,
      input.input_summary || null,
      input.result_text,
      // 배열은 JSON 문자열로 직렬화해 TEXT 컬럼에 저장한다
      input.alternative_texts ? JSON.stringify(input.alternative_texts) : null,
      input.generation_basis_summary || null,
      input.followup_notes || null,
      input.warnings ? JSON.stringify(input.warnings) : null,
      now,
    );

    // insert 후 즉시 조회해 저장된 row를 반환한다 (null 불가 — 방금 저장했으므로)
    return (await this.findById(recommendationId)) as RecommendationHistoryRow;
  }

  /**
   * recommendation_id 기준 단건 조회.
   * 존재하지 않으면 null을 반환한다.
   */
  async findById(recommendationId: string): Promise<RecommendationHistoryRow | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM recommendation_histories WHERE recommendation_id = ?',
    );
    const row = stmt.get(recommendationId) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  /**
   * 프로젝트 전체 추천 이력을 최신순으로 조회한다.
   *
   * @param projectId 프로젝트 ID
   * @param limit 최대 반환 건수 (기본값: 50)
   */
  async listByProject(projectId: string, limit = 50): Promise<RecommendationHistoryRow[]> {
    const stmt = this.db.prepare(
      `SELECT * FROM recommendation_histories
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    );
    const rows = stmt.all(projectId, limit) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * 추천 타입 필터 + 최신순 조회. AI 참고 컨텍스트 수집에 사용한다.
   *
   * 인덱스: idx_recommendation_histories_project_type_created 를 사용한다.
   *
   * @param projectId 프로젝트 ID
   * @param type 추천 유형 (branch_name / commit_message / pr_description 등)
   * @param limit 최대 반환 건수 (기본값: 10)
   */
  async listRecentByType(
    projectId: string,
    type: RecommendationHistoryRow['recommendation_type'],
    limit = 10,
  ): Promise<RecommendationHistoryRow[]> {
    const stmt = this.db.prepare(
      `SELECT * FROM recommendation_histories
       WHERE project_id = ?
         AND recommendation_type = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    );
    const rows = stmt.all(projectId, type, limit) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * 최근 N일 이내의 추천 이력을 타입 필터로 조회한다.
   *
   * 오래된 이력보다 최근 맥락이 AI 참고에 더 유의미하므로
   * 날짜 범위 필터를 추가 제공한다.
   *
   * @param projectId 프로젝트 ID
   * @param type 추천 유형
   * @param withinDays 오늘 기준 최근 N일 이내 (예: 7 → 최근 7일)
   * @param limit 최대 반환 건수 (기본값: 10)
   */
  async listRecentByTypeWithinDays(
    projectId: string,
    type: RecommendationHistoryRow['recommendation_type'],
    withinDays: number,
    limit = 10,
  ): Promise<RecommendationHistoryRow[]> {
    // SQLite의 datetime 함수를 이용해 N일 이전 기준 ISO 문자열을 계산한다
    const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();

    const stmt = this.db.prepare(
      `SELECT * FROM recommendation_histories
       WHERE project_id = ?
         AND recommendation_type = ?
         AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT ?`,
    );
    const rows = stmt.all(projectId, type, since, limit) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * DB raw row를 RecommendationHistoryRow 타입으로 변환한다.
   *
   * [주의] DB 컬럼명과 Row 스키마 필드명 불일치 처리:
   * - DB 컬럼: alternative_texts_json → Row 필드: alternative_texts_json (그대로 보존)
   * - DB 컬럼: warnings_json         → Row 필드: warnings_json (그대로 보존)
   *
   * JSON 역직렬화는 상위 서비스(RecommendationHistoryQueryService.toContext())에서
   * 컨텍스트 DTO 변환 시 수행한다. 이 레이어는 파싱 없이 raw 필드를 그대로 반환한다.
   */
  private mapRow(row: any): RecommendationHistoryRow {
    return {
      recommendation_id: row.recommendation_id,
      project_id: row.project_id,
      session_id: row.session_id ?? null,
      ai_request_id: row.ai_request_id ?? null,
      recommendation_type: row.recommendation_type,
      input_summary: row.input_summary ?? null,
      result_text: row.result_text,
      // DB 컬럼명: alternative_texts_json
      alternative_texts_json: row.alternative_texts_json ?? null,
      generation_basis_summary: row.generation_basis_summary ?? null,
      followup_notes: row.followup_notes ?? null,
      // DB 컬럼명: warnings_json
      warnings_json: row.warnings_json ?? null,
      created_at: row.created_at,
    };
  }
}
