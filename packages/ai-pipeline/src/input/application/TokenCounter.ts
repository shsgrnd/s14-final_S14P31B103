import { encoding_for_model, TiktokenModel, Tiktoken } from 'tiktoken';
import { MergeProposalInput, RecommendationInput } from '@gitcat/shared-types';
import { getDefaultModelConfig } from './TokenConfig';

/**
 * AI 모델에 전달될 데이터의 토큰 사용량을 계산하는 유틸리티 클래스입니다.
 * tiktoken 라이브러리를 사용하여 실제 모델(예: gpt-4o, gpt-3.5 등)과 
 * 동일한 방식으로 토큰을 카운팅합니다.
 */
export class TokenCounter {
  private currentModel: TiktokenModel;

  constructor() {
    this.currentModel = getDefaultModelConfig().modelName;
  }

  /**
   * 지정된 모델의 인코더를 가져옵니다.
   * (주의: 사용이 끝난 후에는 반드시 encoder.free() 를 호출하여 메모리를 해제해야 합니다)
   */
  private getEncoder(): Tiktoken {
    return encoding_for_model(this.currentModel);
  }

  /**
   * 단순 텍스트 문자열의 토큰 수를 계산합니다.
   * 
   * @param text 토큰을 계산할 문자열
   * @returns 계산된 토큰 수
   */
  public countTextTokens(text: string): number {
    if (!text) return 0;
    
    const encoder = this.getEncoder();
    try {
      const tokens = encoder.encode(text);
      return tokens.length;
    } finally {
      // 메모리 릭 방지
      encoder.free();
    }
  }

  /**
   * AiInputService에서 생성된 최종 Payload 전체의 대략적인 토큰 수를 계산합니다.
   * JSON 구조의 오버헤드를 포함하여 보수적으로 측정합니다.
   * 
   * @param payload 최종 조립된 MergeProposalInput 객체
   * @returns 전체 Payload의 예상 토큰 수
   */
  public countPayloadTokens(payload: MergeProposalInput | RecommendationInput): number {
    // 1. 순수 데이터 문자열화
    const jsonString = JSON.stringify(payload);
    
    // 2. 기본 토큰 수 계산
    const rawTokenCount = this.countTextTokens(jsonString);
    
    // 3. 프롬프트 마크다운 래핑 및 시스템 프롬프트 오버헤드 보정 (약 10% 추가)
    // 실제 AI 호출 시에는 이 JSON 데이터 외에 "너는 Git 병합 도우미야..." 같은 지시문이 붙습니다.
    const overheadMargin = Math.ceil(rawTokenCount * 0.1); 
    
    return rawTokenCount + overheadMargin;
  }
}
