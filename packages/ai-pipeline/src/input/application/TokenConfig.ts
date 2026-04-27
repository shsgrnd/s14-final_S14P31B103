import { TiktokenModel } from 'tiktoken';

/**
 * AI 모델별 토큰 설정 및 최적화 임계값 정의
 */
export interface ModelTokenConfig {
  modelName: TiktokenModel;
  /** 모델이 수용 가능한 최대 토큰 (Hard Limit) */
  maxContextTokens: number;
  /** 최적의 추론 품질을 유지하기 위한 안전 임계값 (이 수치를 넘으면 Truncation 시작) */
  safeThresholdTokens: number;
}

/**
 * 기본 모델인 gpt-4.1-mini 설정을 관리합니다.
 * 기타 모델 설정은 .env 환경 변수를 통해 확장 가능하도록 설계되었습니다.
 */
export const TOKEN_CONFIGS: Record<string, ModelTokenConfig> = {
  'gpt-4.1-mini': {
    modelName: 'gpt-4.1-mini' as TiktokenModel,
    maxContextTokens: 128000,
    safeThresholdTokens: 40000,
  }
};

/**
 * .env 파일에서 지정된 모델 이름을 읽어옵니다. (AI_MODEL_NAME)
 * 지정되지 않은 경우 기본값으로 'gpt-4.1-mini'를 사용합니다.
 */
export function getDefaultModelConfig(): ModelTokenConfig {
  const envModel = process.env.AI_MODEL_NAME || 'gpt-4.1-mini';
  return TOKEN_CONFIGS[envModel] || TOKEN_CONFIGS['gpt-4.1-mini'];
}
