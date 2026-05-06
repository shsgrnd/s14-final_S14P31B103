/**
 * RecommendationOrchestrator — 추천 기능 오케스트레이터 계약
 *
 * RecommendationService가 구현해야 할 내부 인터페이스다.
 * RecommendationServiceContract(shared-types)를 확장해 PR 추천 전용 메서드를 추가한다.
 *
 * [인터페이스 분리 원칙]
 * - 추천 이력 조회 전용 계약은 IRecommendationHistoryQueryService 를 참조한다.
 * - 오케스트레이터는 "실행"만, Query 서비스는 "조회"만 책임진다.
 */

import type {
  RecommendationServiceContract,
} from '@gitcat/shared-types/src/interfaces/services';
import type {
  RecommendationInput,
  RecommendationHistory,
  PRRecommendationInput,
  PRRecommendationResult,
} from '@gitcat/shared-types/src/dto/ai';
import type {
  IRecommendationHistoryQueryService,
  RecommendationHistoryContext,
} from '@gitcat/shared-types/src/interfaces/history-query';

// IRecommendationHistoryQueryService와 RecommendationHistoryContext를 외부로 re-export해
// 이 파일을 참조하는 다른 모듈이 shared-types 내부 경로를 직접 참조하지 않아도 된다.
export type { IRecommendationHistoryQueryService, RecommendationHistoryContext };

/**
 * 추천 오케스트레이터 계약입니다.
 *
 * RecommendationServiceContract를 확장하며:
 * - prepareInput(): 추천 입력 payload 구성 (향후 구현)
 * - buildHistoryContext(): 최근 추천 이력을 AI 참고 컨텍스트로 조회 (Query 서비스 위임)
 * - recommendPR(): PR 설명 추천 실행
 */
export interface RecommendationOrchestrator extends RecommendationServiceContract {
  /**
   * 프로젝트/세션 문맥에서 추천 입력 payload를 구성합니다.
   *
   * recommendation_type에 따라 입력 필드가 달라질 수 있으므로
   * 최종 반환 타입은 RecommendationInput으로 통일합니다.
   */
  prepareInput(params: {
    projectId: string;
    sessionId?: string | null;
    recommendationType: RecommendationInput['recommendation_type'];
  }): Promise<RecommendationInput>;

  /**
   * 최근 추천 이력을 AI 프롬프트 참고 컨텍스트로 조회합니다.
   *
   * 내부적으로 RecommendationHistoryQueryService에 위임하며,
   * 레거시 RecommendationHistory[] 형태로 변환해 반환합니다.
   * (AI 파트 연동 시 RecommendationHistoryContext[]로 교체 가능)
   */
  buildHistoryContext(
    projectId: string,
    recommendationType: RecommendationInput['recommendation_type'],
    limit?: number,
  ): Promise<RecommendationHistory[]>;

  /**
   * PR 추천 실행 (Git 데이터 수집 → AI 호출 → 이력 저장 → 반환)
   */
  recommendPR(base: string): Promise<PRRecommendationResult>;
}
