/**
 * RecommendationHistoryQueryService — 추천 이력 조회 전용 Query 서비스
 *
 * 역할:
 * - recommendation_histories 테이블 조회를 전담하는 독립 서비스다.
 * - 조회 결과를 AI 프롬프트에 바로 사용 가능한 RecommendationHistoryContext[]로 가공한다.
 *
 * 설계 원칙:
 * - AI 호출, Git 조회, DB 저장은 이 서비스의 책임이 아니다.
 * - RecommendationHistoryRepository에만 의존하며, 그 외 의존성은 없다.
 * - 브랜치/커밋/PR 추천 서비스가 모두 공통으로 주입받아 사용한다.
 *
 * 조회 전략:
 * - 기본: 최신순(created_at DESC) + 타입 필터
 * - 선택: 최근 N일 이내로 기간 제한 (withinDays 파라미터)
 * - 기본 limit: 5건 (AI 프롬프트 입력 크기를 고려한 기본값)
 */

import type {
  IRecommendationHistoryQueryService,
  RecommendationHistoryContext,
  RecommendationHistoryRepository,
  RecommendationHistoryRow,
} from '@gitcat/shared-types';
import type { RecommendationType } from '@gitcat/shared-types';

/** 조회 타입별 기본 최대 건수 — AI 프롬프트 입력 크기를 고려 */
const DEFAULT_CONTEXT_LIMIT = 5;

export class RecommendationHistoryQueryService implements IRecommendationHistoryQueryService {
  constructor(
    private readonly historyRepository: RecommendationHistoryRepository,
  ) {}

  /**
   * 브랜치명 추천 참고 이력을 조회한다.
   *
   * recommendation_type = 'branch_name' 조건으로 최신순 N건을 반환한다.
   */
  async getContextForBranch(
    projectId: string,
    limit = DEFAULT_CONTEXT_LIMIT,
  ): Promise<RecommendationHistoryContext[]> {
    return this.getRecentContext(projectId, 'branch_name', limit);
  }

  /**
   * 커밋 메시지 추천 참고 이력을 조회한다.
   *
   * recommendation_type = 'commit_message' 조건으로 최신순 N건을 반환한다.
   */
  async getContextForCommit(
    projectId: string,
    limit = DEFAULT_CONTEXT_LIMIT,
  ): Promise<RecommendationHistoryContext[]> {
    return this.getRecentContext(projectId, 'commit_message', limit);
  }

  /**
   * PR description 추천 참고 이력을 조회한다.
   *
   * recommendation_type = 'pr_description' 조건으로 최신순 N건을 반환한다.
   */
  async getContextForPR(
    projectId: string,
    limit = DEFAULT_CONTEXT_LIMIT,
  ): Promise<RecommendationHistoryContext[]> {
    return this.getRecentContext(projectId, 'pr_description', limit);
  }

  /**
   * 추천 타입을 지정해 최신 이력을 조회하는 범용 메서드.
   *
   * 위의 getContextFor* 메서드가 내부적으로 이 메서드를 호출한다.
   * 외부 호출자도 직접 타입을 지정해 사용할 수 있다.
   */
  async getRecentContext(
    projectId: string,
    type: RecommendationType,
    limit = DEFAULT_CONTEXT_LIMIT,
  ): Promise<RecommendationHistoryContext[]> {
    // Repository에서 raw row 조회 (최신순)
    const rows = await this.historyRepository.listRecentByType(projectId, type, limit);
    // Row -> Context DTO 변환
    return rows.map((row) => this.toContext(row));
  }

  /**
   * 최근 N일 이내 이력만 조회하는 기간 제한 버전.
   *
   * 오래된 이력이 AI 컨텍스트에 잡음을 유발할 때 사용한다.
   *
   * @param projectId 프로젝트 ID
   * @param type 추천 유형
   * @param withinDays 오늘 기준 최근 N일 이내
   * @param limit 최대 반환 건수
   */
  async getRecentContextWithinDays(
    projectId: string,
    type: RecommendationType,
    withinDays: number,
    limit = DEFAULT_CONTEXT_LIMIT,
  ): Promise<RecommendationHistoryContext[]> {
    const rows = await this.historyRepository.listRecentByTypeWithinDays(
      projectId,
      type,
      withinDays,
      limit,
    );
    return rows.map((row) => this.toContext(row));
  }

  /**
   * DB Row를 AI 프롬프트 참고용 컨텍스트 DTO로 변환한다.
   *
   * [처리 항목]
   * - alternative_texts_json: JSON 문자열 → string[] 역직렬화
   * - warnings_json: JSON 문자열 → string[] 역직렬화 (현재 컨텍스트 DTO에는 포함하지 않음)
   * - result_text, input_summary 등 AI 참고에 직접 쓰이는 필드만 노출
   */
  toContext(row: RecommendationHistoryRow): RecommendationHistoryContext {
    // alternative_texts_json 컬럼 파싱 (null이거나 파싱 실패 시 null 반환)
    let alternativeTexts: string[] | null = null;
    if (row.alternative_texts_json) {
      try {
        const parsed = JSON.parse(row.alternative_texts_json);
        alternativeTexts = Array.isArray(parsed) ? parsed : null;
      } catch {
        // JSON 파싱 오류는 무시하고 null 처리 (잡음 데이터 방어)
        alternativeTexts = null;
      }
    }

    return {
      recommendation_id: row.recommendation_id,
      recommendation_type: row.recommendation_type as RecommendationType,
      input_summary: row.input_summary ?? null,
      result_text: row.result_text,
      alternative_texts: alternativeTexts,
      generation_basis_summary: row.generation_basis_summary ?? null,
      created_at: row.created_at,
    };
  }
}
