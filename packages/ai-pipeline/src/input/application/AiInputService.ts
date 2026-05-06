import {
  MergeProposalInput,
  MergeProposalInputSchema,
  RecommendationInput,
  RecommendationInputSchema
} from '@gitcat/shared-types';
import { TokenBudgetGuard } from './TokenBudgetGuard';

/**
 * AI 입력을 위한 최종 Payload(Context)를 검증하고 최적화하는 오케스트레이션 서비스.
 * 기존의 Git 연동 로직은 백엔드로 이관되었으며, 
 * 본 서비스는 백엔드가 전달한 순수 데이터를 Zod로 검증하고 
 * TokenBudgetGuard를 통해 LLM 토큰 한도에 맞게 최적화하는 역할만 수행합니다.
 */
export class AiInputService {
  private readonly tokenBudgetGuard: TokenBudgetGuard;

  constructor() {
    // Git 의존성이 모두 제거됨. 토큰 최적화 가드만 초기화합니다.
    this.tokenBudgetGuard = new TokenBudgetGuard();
  }

  /**
   * 병합 제안 및 충돌 분석을 위한 입력 Payload를 최적화하고 검증합니다.
   * 백엔드에서 생성된 rawPayload를 받아 토큰 제한을 적용합니다.
   * 
   * @param rawPayload 백엔드에서 전달받은 병합 제안 입력 원본
   * @returns 토큰 최적화 및 Zod 검증을 통과한 유효한 MergeProposalInput 객체
   */
  public processMergeProposalInput(rawPayload: unknown): MergeProposalInput {
    console.log(`[AiInputService] Validating and optimizing MergeProposalInput...`);

    // 1. Zod를 이용한 1차 구조 검증 (누락된 필드가 없는지)
    // 백엔드에서 넘어온 unknown 데이터를 우선 검증합니다.
    const validatedPayload = MergeProposalInputSchema.parse(rawPayload);

    // 2. 토큰 사용량 측정 및 지능적 절단 (TokenBudgetGuard)
    const optimizedPayload = this.tokenBudgetGuard.enforce(validatedPayload);

    // 3. 최적화 과정에서 스키마가 깨지지 않았는지 2차 검증 후 반환
    return MergeProposalInputSchema.parse(optimizedPayload);
  }

  /**
   * 커밋 메시지 및 PR 디스크립션 추천을 위한 입력 Payload를 검증합니다.
   * 
   * @param rawPayload 백엔드에서 전달받은 추천 기능 입력 원본
   * @returns Zod 검증을 통과한 유효한 RecommendationInput 객체
   */
  public processRecommendationInput(rawPayload: unknown): RecommendationInput {
    console.log(`[AiInputService] Validating RecommendationInput...`);

    // 1. Zod를 이용한 구조 검증
    const validatedPayload = RecommendationInputSchema.parse(rawPayload);

    // 2. TokenBudgetGuard를 통한 토큰 사용량 검증 및 지능적 절단
    const optimizedPayload = this.tokenBudgetGuard.enforce(validatedPayload);

    // 3. 최적화 과정에서 스키마가 깨지지 않았는지 2차 검증 후 반환
    return RecommendationInputSchema.parse(optimizedPayload);
  }
}
