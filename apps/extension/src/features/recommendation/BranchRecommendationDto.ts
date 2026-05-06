import { z } from 'zod';

/**
 * Webview에서 브랜치명 추천을 요청할 때 전달하는 payload입니다.
 * 메시지 프로토콜의 RECOMMEND_BRANCH { purpose: string } 계약을 코드에서 직접 재사용합니다.
 */
export const BranchRecommendationRequestSchema = z.object({
  purpose: z.string().trim().min(1, '작업 목적을 입력해야 합니다.').max(500, '작업 목적은 500자 이하여야 합니다.'),
});

export type BranchRecommendationRequestDto = z.infer<typeof BranchRecommendationRequestSchema>;

/**
 * 추천 서비스가 AI 담당 영역으로 넘길 수 있도록 정리한 최소 입력입니다.
 * 실제 prompt 작성과 provider 호출은 이 단계에서 구현하지 않습니다.
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
  ai_provider_status: 'not_connected';
  schema_version: '1.0';
}

export interface BranchRecommendationResultDto {
  names: string[];
  historyId?: string;
  rawPayload: BranchRecommendationRawPayloadDto;
  generationBasisSummary: string;
  warnings: string[];
}
