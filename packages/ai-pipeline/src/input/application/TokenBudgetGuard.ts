import { MergeProposalInput, RecommendationInput } from '@gitcat/shared-types';
import { TokenCounter } from './TokenCounter';
import { ContextMinimizer } from './ContextMinimizer';
import { getDefaultModelConfig, ModelTokenConfig } from './TokenConfig';
import { ITruncationStrategy } from './ITruncationStrategy';
import { MergeTruncationStrategy } from './MergeTruncationStrategy';
import { RecommendationTruncationStrategy } from './RecommendationTruncationStrategy';

/**
 * payload 토큰 초과 시 주입된 전략(Strategy)에 위임하여 절단을 수행하는 오케스트레이터.
 *
 * 새로운 AI 기능 Payload가 추가될 경우,
 * 이 클래스를 수정하지 않고 새로운 ITruncationStrategy 구현체만 작성하면 됩니다.
 * (Open/Closed Principle)
 */
export class TokenBudgetGuard {
  private readonly tokenCounter: TokenCounter;
  private readonly config: ModelTokenConfig;
  private readonly mergeStrategy: ITruncationStrategy<MergeProposalInput>;
  private readonly recommendationStrategy: ITruncationStrategy<RecommendationInput>;

  constructor() {
    this.tokenCounter = new TokenCounter();
    this.config = getDefaultModelConfig();
    const minimizer = new ContextMinimizer();

    this.mergeStrategy = new MergeTruncationStrategy(this.tokenCounter, minimizer);
    this.recommendationStrategy = new RecommendationTruncationStrategy(this.tokenCounter);
  }

  /**
   * MergeProposalInput payload를 토큰 한도 내로 최적화합니다.
   */
  enforce(payload: MergeProposalInput): MergeProposalInput;
  /**
   * RecommendationInput payload를 토큰 한도 내로 최적화합니다.
   */
  enforce(payload: RecommendationInput): RecommendationInput;
  enforce(payload: MergeProposalInput | RecommendationInput): MergeProposalInput | RecommendationInput {
    const tokenCount = this.tokenCounter.countPayloadTokens(payload);

    if (tokenCount <= this.config.safeThresholdTokens) {
      console.log(`[TokenBudgetGuard] 토큰 OK: ${tokenCount} / ${this.config.safeThresholdTokens}`);
      return payload;
    }

    console.warn(`[TokenBudgetGuard] 토큰 초과 (${tokenCount}tok). 절단 전략 실행.`);

    if (payload.feature_type === 'recommendation') {
      return this.recommendationStrategy.truncate(payload, this.config);
    }
    return this.mergeStrategy.truncate(payload as MergeProposalInput, this.config);
  }
}

