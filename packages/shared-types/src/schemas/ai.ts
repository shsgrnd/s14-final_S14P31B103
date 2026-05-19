import { z } from 'zod';
import {
  FeatureTypeEnum,
  RecommendationTypeEnum,
  MergeProposalStatusEnum,
  SelectionStatusEnum,
  QualityTagEnum,
  RiskLevelEnum,
  ConflictTypeEnum,
} from '../enums/ai';
import { ConflictCandidateSchema } from '../dto/ai';

export const ParsedAiResultBaseSchema = z.object({
  proposal_id: z.string(),
  session_id: z.string().nullable(),
  ai_request_id: z.string(),
  feature_type: FeatureTypeEnum,
  title: z.string(),
  summary: z.string(),
  proposal_status: MergeProposalStatusEnum,
  parser_version: z.string(),
  explanation: z.string().optional(),
  confidence_score: z.number().optional(),
});

export const MergePatchDraftResultSchema = ParsedAiResultBaseSchema.extend({
  feature_type: z.literal('merge_patch_draft'),
  merged_code_ref: z.string(),
  applied_files: z.array(z.string()),
  validation_required: z.boolean(),
  validation_summary: z.string(),
});

export const ConflictExplanationResultSchema = ParsedAiResultBaseSchema.extend({
  feature_type: z.literal('conflict_explanation'),
  cause_summary: z.string(),
  detailed_explanation: z.string(),
  related_files: z.array(z.string()),
  recommended_resolution_direction: z.string(),
  risk_level: RiskLevelEnum,
});

export const MergeMediationResultSchema = ParsedAiResultBaseSchema.extend({
  feature_type: z.literal('merge_mediation'),
  recommended_option: z.string(),
  tradeoffs: z.array(z.string()),
  recommended_next_action: z.string(),
});

export const RecommendationResultSchema = ParsedAiResultBaseSchema.extend({
  feature_type: z.literal('recommendation'),
  recommendation_type: RecommendationTypeEnum,
  primary_text: z.string(),
  alternative_texts: z.array(z.string()),
  generation_basis_summary: z.string().optional(),
  format_notes: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});

export const ParsedAiResultSchema = z.discriminatedUnion('feature_type', [
  MergePatchDraftResultSchema,
  ConflictExplanationResultSchema,
  MergeMediationResultSchema,
  RecommendationResultSchema,
]);

/**
 * LLM이 직접 응답해야 하는 최소화된 데이터 스키마 (merge_patch_draft 전용)
 */
export const MinimalMergePatchResponseSchema = z.object({
  title: z.string(),
  summary: z.string(),
  explanation: z.string().optional().default(""),
  confidence_score: z.number().optional().default(0.5),
  merged_code: z.string().trim().min(1),
  validation_summary: z.string().optional().default(""),
});

export type MinimalMergePatchResponse = z.infer<typeof MinimalMergePatchResponseSchema>;

/**
 * LLM이 직접 응답해야 하는 최소화된 데이터 스키마 (recommendation 전용)
 *
 * docs §3 recommendation SFT 최소 세트 기준:
 *   필수: title, summary, primary_text, alternative_texts
 *   선택: explanation, confidence_score, generation_basis_summary, format_notes, warnings
 *
 * recommendation_type을 포함한 시스템 메타데이터(proposal_id, session_id 등)는
 * 호출 컨텍스트와 파서 후처리에서 주입합니다.
 */
export const MinimalRecommendationResponseSchema = z.object({
  title: z.string(),
  summary: z.string(),
  primary_text: z.string(),
  alternative_texts: z.array(z.string()),
  explanation: z.string().optional().default(''),
  confidence_score: z.number().optional().default(0.5),
  generation_basis_summary: z.string().optional(),
  format_notes: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});

export type MinimalRecommendationResponse = z.infer<typeof MinimalRecommendationResponseSchema>;

// 기존 AiInputPayloadSchema도 통합
export const AiInputPayloadSchema = z.object({
  project_id: z.string(),
  session_id: z.string().nullable(),
  feature_type: FeatureTypeEnum,
  current_branch: z.string(),
  target_branch: z.string().optional(),
  workspace_summary: z.string().optional(),
  related_files: z.array(z.string()).optional(),
  conflict_candidates: z.array(ConflictCandidateSchema).optional(),
  working_tree_diff_ref: z.string().optional(),
  context_bundle_ref: z.string().optional(),
  risk_summary: z.string().optional(),
  schema_version: z.string(),
  recommendation_type: RecommendationTypeEnum.optional(),
  change_summary: z.string().optional(),
  changed_files: z.array(z.string()).optional(),
  work_intent: z.string().optional(),
  diff_summary: z.string().optional(),
  branch_context: z.string().optional(),
  ticket_ref: z.string().optional(),
  naming_constraints: z.array(z.string()).optional(),
  message_constraints: z.array(z.string()).optional(),
  template: z.string().optional(),
  output_language: z.enum(['ko', 'en']).optional(),
}).refine(
  (data) => {
    if (['merge_patch_draft', 'conflict_explanation', 'merge_mediation'].includes(data.feature_type)) {
      return (
        !!data.target_branch &&
        (data.related_files?.length ?? 0) > 0 &&
        (data.conflict_candidates?.length ?? 0) > 0 &&
        !!data.working_tree_diff_ref
      );
    }
    if (data.feature_type === 'recommendation') {
      const isBranchRecommendation = data.recommendation_type === 'branch_name';
      return (
        !!data.recommendation_type &&
        !!data.work_intent &&
        (isBranchRecommendation || (!!data.change_summary && (data.changed_files?.length ?? 0) > 0))
      );
    }
    return true;
  },
  { message: "Missing required fields for the specific feature_type" }
);

export type AiInputPayload = z.infer<typeof AiInputPayloadSchema>;
