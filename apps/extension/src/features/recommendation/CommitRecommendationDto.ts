import { z } from 'zod';
import type { CommitSuggestion, RecommendationHistoryRow } from '@gitcat/shared-types';
import type { BranchInfoResponse, LogEntryResponse } from '../git/GitService';

export const CommitRecommendationRequestSchema = z.object({
  diffText: z.string().trim().min(1, '커밋 추천 요청 내용은 비어 있을 수 없습니다.'),
  tag: z.string().trim().optional(),
});

export type CommitRecommendationRequestDto = z.infer<typeof CommitRecommendationRequestSchema>;

export interface CommitRecommendationRawDataOptionsDto {
  recentCommitLimit?: number;
}

export interface CommitRecommendationBranchContextDto {
  currentBranch: string;
  branchNames: string[];
  protectedBranchNames: string[];
}

export interface CommitRecommendationRawDataDto {
  stagedDiff: string;
  currentBranch: string;
  recentCommits: LogEntryResponse[];
  branchContext: CommitRecommendationBranchContextDto;
  collectedAt: string;
}

export interface CommitRecommendationHistoryContextDto {
  recommendationId: string;
  inputSummary: string | null;
  resultText: string;
  alternativeTexts: string[];
  createdAt: string;
}

export interface CommitRecommendationRawPayloadDto {
  project_id: string;
  session_id: string | null;
  recommendation_type: 'commit_message';
  work_intent: string;
  tag?: string;
  current_branch: string;
  staged_diff: string;
  changed_files: string[];
  recent_commits: LogEntryResponse[];
  branch_context: CommitRecommendationBranchContextDto;
  recent_histories: CommitRecommendationHistoryContextDto[];
  ai_provider_status: 'not_connected' | 'ready';
  schema_version: string;
}

export interface CommitRecommendationResultDto {
  suggestions: CommitSuggestion;
  historyId?: string;
  rawPayload: CommitRecommendationRawPayloadDto;
  generationBasisSummary: string;
  warnings: string[];
}

export interface CommitRecommendationCollectionFailureDto {
  step: 'status' | 'stagedDiff' | 'recentCommits' | 'branches';
  message: string;
}

export function toCommitRecommendationBranchContext(
  currentBranch: string,
  branches: BranchInfoResponse[],
): CommitRecommendationBranchContextDto {
  return {
    currentBranch,
    branchNames: branches.map((branch) => branch.name),
    protectedBranchNames: branches
      .filter((branch) => branch.status === 'protected')
      .map((branch) => branch.name),
  };
}

export function toCommitRecommendationHistoryContext(
  row: RecommendationHistoryRow,
): CommitRecommendationHistoryContextDto {
  return {
    recommendationId: row.recommendation_id,
    inputSummary: row.input_summary,
    resultText: row.result_text,
    alternativeTexts: parseJsonStringArray(row.alternative_texts_json),
    createdAt: row.created_at,
  };
}

function parseJsonStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
