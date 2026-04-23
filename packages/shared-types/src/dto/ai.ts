import { z } from 'zod';
import { 
  ConflictTypeEnum, 
  RiskLevelEnum, 
  FeatureTypeEnum, 
  RequestOriginEnum, 
  TriggerSourceEnum,
  ConfidenceEnum,
  DetectionMethodEnum,
  ChangeTypeEnum,
  RecommendationTypeEnum
} from '../enums/ai';

// ==========================================
// 1. Common / Base Types (snake_case)
// ==========================================

export const LineRangeSchema = z.object({
  start: z.number(),
  end: z.number(),
});
export type LineRange = z.infer<typeof LineRangeSchema>;

export const ChangedFileSchema = z.object({
  file_path: z.string(),
  change_type: ChangeTypeEnum,
  location: z.string().optional(),
  summary: z.string().optional(),
});
export type ChangedFile = z.infer<typeof ChangedFileSchema>;

// ==========================================
// 2. Conflict & Merge (Output)
// ==========================================

export const ConflictCandidateSchema = z.object({
  candidate_id: z.string(),
  analysis_id: z.string(),
  file_path: z.string(),
  line_range: LineRangeSchema,
  source_code: z.string(),
  target_code: z.string(),
  base_code: z.string().optional(),
  confidence: ConfidenceEnum,
  detected_by: DetectionMethodEnum,
});
export type ConflictCandidate = z.infer<typeof ConflictCandidateSchema>;

export const MergeProposalSchema = z.object({
  proposal_id: z.string(),
  analysis_id: z.string(),
  created_at: z.string(),
  file_path: z.string(),
  proposed_code: z.string(),
  explanation: z.string(),
  confidence: ConfidenceEnum,
});
export type MergeProposal = z.infer<typeof MergeProposalSchema>;

// ==========================================
// 3. Recommendation (Output)
// ==========================================

export const CommitSuggestionSchema = z.object({
  messages: z.array(z.string()),
  branch_names: z.array(z.string()),
  description: z.string(),
});
export type CommitSuggestion = z.infer<typeof CommitSuggestionSchema>;

// ==========================================
// 4. AI Input Payloads (snake_case)
// ==========================================

export const AiTaskRequestSchema = z.object({
  project_id: z.string(),
  session_id: z.string(),
  feature_type: FeatureTypeEnum,
  user_intent: z.string(),
  request_origin: RequestOriginEnum,
  trigger_source: TriggerSourceEnum,
  requested_at: z.string(),
});
export type AiTaskRequest = z.infer<typeof AiTaskRequestSchema>;

export const MergeProposalInputSchema = z.object({
  project_id: z.string(),
  session_id: z.string(),
  feature_type: z.enum(['merge_patch_draft', 'merge_mediation', 'conflict_explanation']),
  current_branch: z.string(),
  target_branch: z.string(),
  workspace_summary: z.string().optional(),
  related_files: z.array(z.string()),
  conflict_candidates: z.array(ConflictCandidateSchema),
  working_tree_diff_ref: z.string(),
  risk_summary: z.string().optional(),
  schema_version: z.string(),
});
export type MergeProposalInput = z.infer<typeof MergeProposalInputSchema>;

export const RecommendationInputSchema = z.object({
  project_id: z.string(),
  session_id: z.string(),
  feature_type: z.literal('recommendation'),
  recommendation_type: RecommendationTypeEnum,
  current_branch: z.string(),
  workspace_summary: z.string().optional(),
  change_summary: z.string(),
  changed_files: z.array(z.string()),
  work_intent: z.string(),
  diff_summary: z.string().optional(),
  branch_context: z.string().optional(),
  ticket_ref: z.string().optional(),
  naming_constraints: z.array(z.string()).optional(),
  message_constraints: z.array(z.string()).optional(),
  schema_version: z.string(),
});
export type RecommendationInput = z.infer<typeof RecommendationInputSchema>;
