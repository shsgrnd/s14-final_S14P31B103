import type {
  RecommendationServiceContract,
} from '../../../../../packages/shared-types/src/contracts/services';
import type { RecommendationInput, RecommendationHistory } from '../../../../../packages/shared-types/src/dto/ai';

/**
 * 추천 오케스트레이터 계약입니다.
 *
 * 1단계에서는 시그니처만 고정하고,
 * 실제 추천 생성/이력 반영 로직은 3단계에서 구현합니다.
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
   * 최근 추천 이력을 컨텍스트 형태로 조회합니다.
   *
   * AI 프롬프트에 보조 자료로 넣기 위한 데이터 수집 지점입니다.
   */
  buildHistoryContext(
    projectId: string,
    recommendationType: RecommendationInput['recommendation_type'],
    limit?: number,
  ): Promise<RecommendationHistory[]>;
}
