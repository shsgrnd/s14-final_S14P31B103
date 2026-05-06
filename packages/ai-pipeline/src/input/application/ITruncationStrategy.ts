import { ModelTokenConfig } from './TokenConfig';

/**
 * 페이로드 토큰 절단을 위한 전략 인터페이스.
 *
 * 새로운 AI 기능(Payload 타입)이 추가될 때마다 이 인터페이스를 구현한
 * 전략 클래스만 새로 작성하면 됩니다. TokenBudgetGuard는 수정할 필요가 없습니다.
 * (Open/Closed Principle)
 */
export interface ITruncationStrategy<T> {
  /**
   * 토큰 한도를 초과한 payload를 단계적으로 절단하여 반환합니다.
   *
   * @param payload 절단 대상 payload
   * @param config 현재 모델의 토큰 예산 설정
   * @returns 토큰 예산 내로 절단된 payload
   */
  truncate(payload: T, config: ModelTokenConfig): T;
}
