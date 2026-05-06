/**
 * PR 추천 전용 내부 인터페이스 모음
 *
 * 커밋명/브랜치명 추천과 독립적으로 개발할 수 있도록 PR 전용 계약을 별도 파일로 분리한다.
 *
 * [공유 인프라와 구분]
 * - RecommendationHistoryRepository, RecommendationHistoryQueryService 는
 *   branch/commit/PR 공통이므로 이 파일에 포함하지 않는다.
 * - 이 파일은 PR 비즈니스 로직 계층(PrRecommendationService, PrRecommendationHandler)만
 *   관심 갖는 계약을 정의한다.
 */

import type {
  RecommendationServiceContract,
} from '@gitcat/shared-types/src/interfaces/services';
import type {
  RecommendationInput,
  RecommendationHistory,
  PRRecommendationResult,
} from '@gitcat/shared-types/src/dto/ai';
import type {
  IRecommendationHistoryQueryService,
  RecommendationHistoryContext,
} from '@gitcat/shared-types/src/interfaces/history-query';

// 공통 인프라 타입을 re-export 해 이 파일만 import해도 바로 쓸 수 있게 한다
export type { IRecommendationHistoryQueryService, RecommendationHistoryContext };

/**
 * PR 추천 오케스트레이터 계약입니다.
 *
 * RecommendationServiceContract(이력 저장/조회)를 상속하며,
 * PR 추천에만 필요한 메서드를 추가로 정의합니다.
 *
 * 커밋명/브랜치명 추천 서비스는 이 인터페이스와 무관하게 독립 개발합니다.
 */
export interface PrRecommendationOrchestrator extends RecommendationServiceContract {
  /**
   * PR 추천 입력 payload를 구성합니다.
   * Git 상태, base/current 브랜치, diff 등을 조합합니다.
   * (향후 구현 예정)
   */
  prepareInput(params: {
    projectId: string;
    sessionId?: string | null;
    recommendationType: RecommendationInput['recommendation_type'];
  }): Promise<RecommendationInput>;

  /**
   * 최근 PR 추천 이력을 AI 프롬프트 참고 컨텍스트로 조회합니다.
   *
   * RecommendationHistoryQueryService에 위임해 DB 조회를 수행합니다.
   */
  buildHistoryContext(
    projectId: string,
    recommendationType: RecommendationInput['recommendation_type'],
    limit?: number,
  ): Promise<RecommendationHistory[]>;

  /**
   * PR description 추천을 실행합니다.
   *
   * 흐름: Git 데이터 수집 → AI 호출 → 이력 저장 → 결과 반환
   *
   * @param base 비교 기준 브랜치명 (예: 'main', 'develop')
   */
  recommendPR(base: string): Promise<PRRecommendationResult>;
}
