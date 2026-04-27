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
  session_id: z.string(),
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
  diff_patch_ref: z.string().optional(),
  merged_code_ref: z.string().optional(),
  applied_files: z.array(z.string()),
  validation_required: z.boolean(),
  validation_summary: z.string(),
}).refine(
  (data) => !!data.diff_patch_ref || !!data.merged_code_ref,
  { message: "Either diff_patch_ref or merged_code_ref must be provided for merge_patch_draft" }
);

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

// 기존 AiInputPayloadSchema도 통합
export const AiInputPayloadSchema = z.object({
  project_id: z.string(),
  session_id: z.string(),
  feature_type: FeatureTypeEnum,
  current_branch: z.string(),
  target_branch: z.string().optional(),
  workspace_summary: z.string().optional(),
  related_files: z.array(z.string()).optional(),
  conflict_candidates: z.array(ConflictCandidateSchema).optional(),
  working_tree_diff_ref: z.string().optional(),
  risk_summary: z.string().optional(),
  schema_version: z.string(),
  recommendation_type: RecommendationTypeEnum.optional(),
  change_summary: z.string().optional(),
  changed_files: z.array(z.string()).optional(),
  work_intent: z.string().optional(),
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
      return (
        !!data.recommendation_type &&
        !!data.change_summary &&
        (data.changed_files?.length ?? 0) > 0 &&
        !!data.work_intent
      );
    }
    return true;
  },
  { message: "Missing required fields for the specific feature_type" }
);

export type AiInputPayload = z.infer<typeof AiInputPayloadSchema>;
