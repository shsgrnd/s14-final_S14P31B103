/**
 * 브랜치 추천 서비스 내부에서 AI 직전 payload를 만들기 위해 사용하는 입력 DTO.
 * 실제 provider 호출은 다음 단계에서 연결 예정.
 */
export interface BranchRecommendationInputDto {
  purpose: string;
  currentBranch: string;
  existingBranches: string[];
}

export interface BranchRecommendationHistoryContextDto {
  recommendationId: string;
  inputSummary: string | null;
  resultText: string;
  alternativeTexts: string[];
  createdAt: string;
}

export interface BranchRecommendationRawPayloadDto {
  project_id: string;
  session_id: string | null;
  recommendation_type: 'branch_name';
  work_intent: string;
  current_branch: string;
  existing_branches: string[];
  recent_histories: BranchRecommendationHistoryContextDto[];
  ai_provider_status: 'not_connected' | 'ready';
  schema_version: '1.0';
}

export interface BranchRecommendationResultDto {
  names: string[];
  historyId?: string;
  rawPayload: BranchRecommendationRawPayloadDto;
  generationBasisSummary: string;
  warnings: string[];
}
