/**
 * IRecommendationHistoryQueryService — 추천 이력 조회 전용 Query 서비스 계약
 *
 * 역할:
 * - recommendation_histories 테이블을 추천 타입별로 조회한다.
 * - 조회 결과를 AI 프롬프트에 바로 사용 가능한 "컨텍스트 요약" 형태로 가공해 반환한다.
 *
 * 설계 원칙:
 * - AI 호출, Git 조회, DB 저장은 이 인터페이스의 책임이 아니다.
 * - 브랜치/커밋/PR 추천 서비스가 모두 공통으로 의존할 수 있는 통일된 계약을 제공한다.
 * - 조회 전략: 기본적으로 "최신순(created_at DESC)" 을 사용한다.
 */

import type { RecommendationHistoryRow } from '../dto/storage';
import type { RecommendationType } from '../enums/ai';

/**
 * AI 프롬프트에 참고 자료로 삽입하기 위한 추천 이력 컨텍스트 DTO.
 *
 * 실제 DB Row의 모든 필드를 그대로 노출하는 대신,
 * AI에게 필요한 "무엇을 추천했는가"와 "어떤 입력 맥락이었는가"만 추출한다.
 */
export interface RecommendationHistoryContext {
  /** 추천 이력 식별자 */
  recommendation_id: string;
  /** 추천 유형 (branch_name / commit_message / pr_description 등) */
  recommendation_type: RecommendationType;
  /** 추천 시점의 입력 맥락 요약 (nullable) */
  input_summary: string | null;
  /** AI가 생성한 최종 추천 텍스트 */
  result_text: string;
  /** 대안 추천 목록 (nullable). AI가 여러 후보를 제안한 경우 사용 */
  alternative_texts: string[] | null;
  /** 추천 생성 근거 요약 (nullable). AI가 왜 이 결과를 냈는지 기록 */
  generation_basis_summary: string | null;
  /** 추천 생성 일시 (ISO 8601) */
  created_at: string;
}

/**
 * 추천 이력 조회 서비스의 공통 계약 인터페이스.
 *
 * 각 메서드는 추천 타입(branch_name / commit_message / pr_description)에
 * 특화된 조회를 수행하며, 결과를 RecommendationHistoryContext[] 로 반환한다.
 *
 * 구현체(RecommendationHistoryQueryService)는 이 인터페이스에만 의존해야 하며,
 * 실제 DB 접근은 RecommendationHistoryRepository에 위임한다.
 */
export interface IRecommendationHistoryQueryService {
  /**
   * 브랜치명 추천에 사용할 참고 이력을 조회한다.
   *
   * recommendation_type = 'branch_name' 조건으로 최신순 N건을 반환한다.
   *
   * @param projectId 현재 프로젝트 ID
   * @param limit 반환할 최대 이력 건수 (기본값: 5)
   */
  getContextForBranch(
    projectId: string,
    limit?: number,
  ): Promise<RecommendationHistoryContext[]>;

  /**
   * 커밋 메시지 추천에 사용할 참고 이력을 조회한다.
   *
   * recommendation_type = 'commit_message' 조건으로 최신순 N건을 반환한다.
   *
   * @param projectId 현재 프로젝트 ID
   * @param limit 반환할 최대 이력 건수 (기본값: 5)
   */
  getContextForCommit(
    projectId: string,
    limit?: number,
  ): Promise<RecommendationHistoryContext[]>;

  /**
   * PR description 추천에 사용할 참고 이력을 조회한다.
   *
   * recommendation_type = 'pr_description' 조건으로 최신순 N건을 반환한다.
   *
   * @param projectId 현재 프로젝트 ID
   * @param limit 반환할 최대 이력 건수 (기본값: 5)
   */
  getContextForPR(
    projectId: string,
    limit?: number,
  ): Promise<RecommendationHistoryContext[]>;

  /**
   * 추천 타입에 무관하게 최신 이력을 조회한다. (범용 조회)
   *
   * 특정 타입에 제한하지 않고, 지정한 type의 최신 이력을 조회한다.
   * 위의 세 메서드가 내부적으로 이 메서드를 호출하도록 구현할 수 있다.
   *
   * @param projectId 현재 프로젝트 ID
   * @param type 추천 유형
   * @param limit 반환할 최대 이력 건수 (기본값: 5)
   */
  getRecentContext(
    projectId: string,
    type: RecommendationType,
    limit?: number,
  ): Promise<RecommendationHistoryContext[]>;

  /**
   * Row를 컨텍스트 DTO로 변환하는 헬퍼 (구현체에서 내부적으로 사용).
   *
   * 인터페이스에 포함시켜 구현체 간 변환 규칙을 통일한다.
   * 단, 외부 호출자는 위의 getContext* 메서드만 사용하는 것을 원칙으로 한다.
   */
  toContext(row: RecommendationHistoryRow): RecommendationHistoryContext;
}
