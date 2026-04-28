import { ParsedAiResult } from '@gitcat/shared-types';
import {
  buildParsedResultStoragePlan,
  MergeProposalStoragePlan,
  RecommendationStoragePlan,
} from './result-storage-plan';

export interface MergeProposalRepositoryLinkageInput {
  conflict_candidate_id: string;
  inference_run_id: string;
  file_path: string;
  parsed_at?: string;
}

export interface RecommendationHistoryRepositoryLinkageInput {
  project_id: string;
  session_id?: string;
  ai_request_id?: string;
  input_summary?: string;
  followup_notes?: string;
  created_at?: string;
}

export interface MergeProposalRepositoryInputDraft {
  proposal_id: string;
  conflict_candidate_id: string;
  inference_run_id: string;
  file_path: string;
  feature_type: 'merge_patch_draft' | 'conflict_explanation' | 'merge_mediation';
  title: string;
  explanation_summary: string | null;
  diff_patch_ref: string | null;
  merged_code_ref: string | null;
  confidence_score: number | null;
  validation_required: boolean;
  validation_summary: string | null;
  status: ParsedAiResult['proposal_status'];
  parsed_at: string;
}

export interface RecommendationHistoryRepositoryInputDraft {
  // 공식 문서의 parsed_ai_result는 recommendation 전용 id 대신 proposal_id를 공통 식별자로 둡니다.
  // 저장 계층으로 넘길 때는 recommendation_history의 recommendation_id로 재사용합니다.
  recommendation_id: string;
  project_id: string;
  session_id: string;
  ai_request_id: string;
  recommendation_type: string;
  input_summary: string | null;
  result_text: string;
  alternative_texts: string[];
  generation_basis_summary: string | null;
  followup_notes: string | null;
  warnings: string[];
  created_at: string;
}

export type ParsedResultRepositoryInputDraft =
  | MergeProposalRepositoryInputDraft
  | RecommendationHistoryRepositoryInputDraft;

function buildMergeProposalRepositoryInputDraft(
  result: Exclude<ParsedAiResult, { feature_type: 'recommendation' }>,
  linkage: MergeProposalRepositoryLinkageInput,
): MergeProposalRepositoryInputDraft {
  // 이 함수는 recommendation이 아닌 결과만 받으므로,
  // Task 18 helper의 반환값도 merge_proposal 저장 계획으로 안전하게 좁힐 수 있습니다.
  const storagePlan =
    buildParsedResultStoragePlan(result) as MergeProposalStoragePlan;
  const patchRef =
    result.feature_type === 'merge_patch_draft' ? result.diff_patch_ref ?? null : null;
  const mergedCodeRef =
    result.feature_type === 'merge_patch_draft' ? result.merged_code_ref ?? null : null;

  return {
    proposal_id: storagePlan.proposal_id,
    conflict_candidate_id: linkage.conflict_candidate_id,
    inference_run_id: linkage.inference_run_id,
    file_path: linkage.file_path,
    feature_type: result.feature_type,
    title: storagePlan.sqlite_metadata.title,
    explanation_summary: storagePlan.sqlite_metadata.explanation_summary,
    diff_patch_ref: patchRef,
    merged_code_ref: mergedCodeRef,
    confidence_score: storagePlan.sqlite_metadata.confidence_score,
    validation_required: storagePlan.sqlite_metadata.validation_required ?? false,
    validation_summary: storagePlan.sqlite_metadata.validation_summary ?? null,
    status: storagePlan.sqlite_metadata.status,
    parsed_at: linkage.parsed_at ?? new Date().toISOString(),
  };
}

function buildRecommendationHistoryRepositoryInputDraft(
  result: Extract<ParsedAiResult, { feature_type: 'recommendation' }>,
  linkage: RecommendationHistoryRepositoryLinkageInput,
): RecommendationHistoryRepositoryInputDraft {
  const storagePlan = buildParsedResultStoragePlan(result) as RecommendationStoragePlan;

  return {
    recommendation_id: storagePlan.proposal_id,
    project_id: linkage.project_id,
    session_id: linkage.session_id ?? storagePlan.session_id,
    ai_request_id: linkage.ai_request_id ?? storagePlan.ai_request_id,
    recommendation_type: storagePlan.sqlite_metadata.recommendation_type,
    input_summary: linkage.input_summary ?? null,
    result_text: storagePlan.sqlite_metadata.result_text,
    alternative_texts: storagePlan.sqlite_metadata.alternative_texts,
    generation_basis_summary:
      storagePlan.sqlite_metadata.generation_basis_summary,
    followup_notes: linkage.followup_notes ?? null,
    warnings: storagePlan.sqlite_metadata.warnings,
    created_at: linkage.created_at ?? new Date().toISOString(),
  };
}

/**
 * 공식 문서 기준의 저장 입력 초안을 만듭니다.
 *
 * 중요한 점:
 * - 아직 실제 repository insert를 호출하지 않습니다.
 * - 현재 shared-types/contracts에는 일부 저장 계약 드리프트가 남아 있으므로,
 *   이 helper는 문서 기준 필드명과 최소 입력 shape를 먼저 고정하는 역할만 맡습니다.
 * - Task 20의 목적은 "어떤 값이 추가로 필요하고 어떤 값은 지금 바로 채울 수 있는지"
 *   명확히 드러내는 것이므로, linkage 입력은 별도 파라미터로 강제합니다.
 */
export function buildParsedResultRepositoryInputDraft(
  result: Extract<ParsedAiResult, { feature_type: 'recommendation' }>,
  linkage: RecommendationHistoryRepositoryLinkageInput,
): RecommendationHistoryRepositoryInputDraft;
export function buildParsedResultRepositoryInputDraft(
  result: Exclude<ParsedAiResult, { feature_type: 'recommendation' }>,
  linkage: MergeProposalRepositoryLinkageInput,
): MergeProposalRepositoryInputDraft;
export function buildParsedResultRepositoryInputDraft(
  result: ParsedAiResult,
  linkage:
    | MergeProposalRepositoryLinkageInput
    | RecommendationHistoryRepositoryLinkageInput,
): ParsedResultRepositoryInputDraft {
  if (result.feature_type === 'recommendation') {
    return buildRecommendationHistoryRepositoryInputDraft(
      result,
      linkage as RecommendationHistoryRepositoryLinkageInput,
    );
  }

  return buildMergeProposalRepositoryInputDraft(
    result,
    linkage as MergeProposalRepositoryLinkageInput,
  );
}
