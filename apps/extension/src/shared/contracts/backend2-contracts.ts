import type {
  Backend2Dependencies,
  MergeFeedbackServiceContract,
  MergeMetadataServiceContract,
  RecommendationServiceContract,
} from '../../../../../packages/shared-types/src/contracts/services';
import type { MessageValidator } from '../../../../../packages/shared-types/src/contracts/repositories';

/**
 * backend2가 제공하는 서비스 집합 계약입니다.
 *
 * 메시지 라우터나 backend1 계층은 이 계약만 바라보고 호출합니다.
 */
export interface Backend2ServiceBundle {
  recommendationService: RecommendationServiceContract;
  mergeFeedbackService: MergeFeedbackServiceContract;
  mergeMetadataService: MergeMetadataServiceContract;
}

/**
 * backend2 구성 시 주입받는 최상위 의존성 계약입니다.
 *
 * - dependencies: 저장소/설정/시크릿 등 런타임 의존성
 * - messageValidator: Webview 메시지 검증기
 */
export interface Backend2InjectionContract {
  dependencies: Backend2Dependencies;
  messageValidator: MessageValidator;
}
