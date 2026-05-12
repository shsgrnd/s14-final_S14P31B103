import { z } from 'zod';
import {
  FeatureTypeEnum,
  RequestOriginEnum,
  TriggerSourceEnum,
  ResponseFormatEnum,
  RequestStatusEnum,
  MergeProposalStatusEnum,
  SelectionStatusEnum,
  QualityTagEnum,
  RiskLevelEnum,
  ChangeTypeEnum,
  DetectionMethodEnum,
  SnapshotReasonEnum,
  SessionTypeEnum,
  RecommendationTypeEnum,
  InferenceRunTypeEnum,
  InferenceRunStatusEnum,
  MergeAnalysisStatusEnum,
  DatasetTypeEnum,
  SourceTypeEnum,
  FeatureType,
  RiskLevel,
  RecommendationType,
} from '../enums/ai';

// ==========================================
// 1. Git 공통 타입
// ==========================================

// ERD: changed_files 테이블 기준
export const ChangedFileSchema = z.object({
  file_path: z.string(),
  change_type: ChangeTypeEnum,         // 'added' | 'modified' | 'deleted' | 'renamed'
  location: z.string().optional(),
  summary: z.string().optional(),
});
export type ChangedFile = z.infer<typeof ChangedFileSchema>;

// ==========================================
// 2. 충돌 후보 (conflict_candidates 테이블)
// ==========================================

// ERD에 맞춰 line_range 중첩 객체 → line_start, line_end 플랫 필드로 변경
export const ConflictCandidateSchema = z.object({
  candidate_id: z.string(),
  analysis_id: z.string(),
  file_path: z.string(),
  line_start: z.number().int(),        // ERD: INT
  line_end: z.number().int(),          // ERD: INT
  source_code: z.string(),             // 로컬 FS에 저장되지만 AI 파이프라인 내부 전달용
  target_code: z.string(),
  base_code: z.string().optional(),
  conflict_type: z.string().optional(),
  reason_summary: z.string().optional(),
  risk_level: RiskLevelEnum.optional(),
  detected_by: DetectionMethodEnum,
});
export type ConflictCandidate = z.infer<typeof ConflictCandidateSchema>;

// ==========================================
// 3. 병합 분석 (merge_analyses 테이블)
// ==========================================

export const MergeAnalysisSchema = z.object({
  analysis_id: z.string(),
  session_id: z.string(),
  source_worktree_instance_id: z.string(),
  target_worktree_instance_id: z.string().optional(),
  merge_base: z.string().optional(),
  status: MergeAnalysisStatusEnum,
  analysis_artifact_path: z.string().optional(),
  proposal_artifact_path: z.string().optional(),
  created_at: z.string(),
});
export type MergeAnalysis = z.infer<typeof MergeAnalysisSchema>;

// ==========================================
// 4. 병합 제안 (merge_proposals 테이블)
// ==========================================

// ERD 기준: candidate_id, ai_request_id 참조, confidence_score는 REAL
export const MergeProposalSchema = z.object({
  candidate_id: z.string(),            // ERD: FK → conflict_candidates
  ai_request_id: z.string(),           // ERD: FK → ai_requests (기존 analysis_id 수정)
  file_path: z.string(),
  feature_type: FeatureTypeEnum,
  title: z.string().optional(),
  explanation_summary: z.string().optional(),
  proposed_code: z.string(),           // 로컬 FS 저장용이지만 AI 파이프라인 전달용
  confidence_score: z.number().min(0).max(1),  // ERD: REAL (0.0~1.0, 기존 ConfidenceEnum 수정)
  validation_required: z.boolean().optional(),
  validation_summary: z.string().optional(),
  status: MergeProposalStatusEnum,
  created_at: z.string(),
});
export type MergeProposal = z.infer<typeof MergeProposalSchema>;

// ==========================================
// 5. AI 요청 (ai_requests 테이블)
// ==========================================

export const AiTaskRequestSchema = z.object({
  project_id: z.string(),
  session_id: z.string(),
  feature_type: FeatureTypeEnum,
  user_intent: z.string(),
  request_origin: RequestOriginEnum,
  trigger_source: TriggerSourceEnum,
  response_format: ResponseFormatEnum.optional(),
  status: RequestStatusEnum,
  requested_at: z.string(),
});
export type AiTaskRequest = z.infer<typeof AiTaskRequestSchema>;

// ==========================================
// 6. AI 입력 Payload (ai-pipeline 내부 전달용)
// ==========================================

// 병합/충돌 설명 관련 기능 payload
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

// 공통 추천 베이스
export const RecommendationBaseSchema = z.object({
  project_id: z.string(),
  session_id: z.string().nullable(),
  feature_type: z.literal('recommendation'),
  current_branch: z.string(),
  workspace_summary: z.string().optional(),
  work_intent: z.string(),
  ticket_ref: z.string().optional(),
  schema_version: z.string(),
});

// 브랜치 추천 payload
export const BranchRecommendationInputSchema = RecommendationBaseSchema.extend({
  recommendation_type: z.literal('branch_name'),
  branch_context: z.string().optional(),
  naming_constraints: z.array(z.string()).optional(),
});
export type BranchRecommendationInput = z.infer<typeof BranchRecommendationInputSchema>;

// 커밋 추천 payload
export const CommitRecommendationInputSchema = RecommendationBaseSchema.extend({
  recommendation_type: z.literal('commit_message'),
  change_summary: z.string(),
  changed_files: z.array(z.string()),
  diff_summary: z.string().optional(),
  branch_context: z.string().optional(),
  message_constraints: z.array(z.string()).optional(),
});
export type CommitRecommendationInput = z.infer<typeof CommitRecommendationInputSchema>;

// PR 추천 payload
export const PrRecommendationInputSchema = RecommendationBaseSchema.extend({
  recommendation_type: z.literal('pr_description'),
  change_summary: z.string(),
  changed_files: z.array(z.string()),
  diff_summary: z.string().optional(),
  branch_context: z.string(),
  template: z.string().optional(),
});
export type PrRecommendationInput = z.infer<typeof PrRecommendationInputSchema>;

// 추천 기능 payload (통합)
export const RecommendationInputSchema = z.discriminatedUnion('recommendation_type', [
  BranchRecommendationInputSchema,
  CommitRecommendationInputSchema,
  PrRecommendationInputSchema,
]);
export type RecommendationInput = z.infer<typeof RecommendationInputSchema>;

// ==========================================
// 7. 추론 실행 (inference_runs 테이블)
// ==========================================

export const InferenceRunSchema = z.object({
  inference_run_id: z.string(),
  session_id: z.string(),
  ai_request_id: z.string().optional(),
  parent_inference_run_id: z.string().optional(),
  run_type: InferenceRunTypeEnum,
  input_summary: z.string().optional(),
  status: InferenceRunStatusEnum,
  response_ref: z.string().optional(),
  created_at: z.string(),
});
export type InferenceRun = z.infer<typeof InferenceRunSchema>;

// ==========================================
// 8. 추천 결과 (recommendation_histories 테이블)
// ==========================================

export const RecommendationHistorySchema = z.object({
  recommendation_id: z.string(),
  ai_request_id: z.string(),
  recommendation_type: RecommendationTypeEnum,
  result_summary: z.string().optional(),
  result_text: z.string().optional(),
  response_ref: z.string().optional(),
  created_at: z.string(),
});
export type RecommendationHistory = z.infer<typeof RecommendationHistorySchema>;

// ==========================================
// 9. 사용자 피드백 (proposal_feedbacks 테이블)
// ==========================================

export const ProposalFeedbackSchema = z.object({
  feedback_id: z.string(),
  // proposal_feedback_payload 문서 기준의 공통 식별자
  proposal_id: z.string(),
  // 기존 코드/저장 흐름 호환용 alias. 이후 proposal_id 기준으로 정리 권장
  merge_proposal_id: z.string().optional(),
  recommendation_id: z.string().optional(),
  session_id: z.string().optional(),
  selection_status: SelectionStatusEnum,
  final_text: z.string().optional(),
  final_code_ref: z.string().optional(),
  final_explanation: z.string().optional(),
  input_summary: z.string().optional(),
  response_ref: z.string().optional(),
  feedback_note: z.string().optional(),
  quality_tag: QualityTagEnum.optional(),
  decided_at: z.string(),
});
export type ProposalFeedback = z.infer<typeof ProposalFeedbackSchema>;

// ==========================================
// 10. 학습 후보 payload (training_candidate_payload)
// ==========================================

export const TrainingCandidatePayloadSchema = z.object({
  training_candidate_id: z.string(),
  proposal_id: z.string(),
  feedback_id: z.string().optional(),
  dataset_type: DatasetTypeEnum,
  source_type: SourceTypeEnum,
  prompt_ref: z.string().optional(),
  chosen_ref: z.string().optional(),
  rejected_ref: z.string().optional(),
  is_approved: z.boolean().optional(),
  is_exported: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if ((data.dataset_type === 'sft' || data.dataset_type === 'dpo') && !data.chosen_ref) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['chosen_ref'],
      message: 'chosen_ref is required when dataset_type is sft or dpo',
    });
  }

  if (data.dataset_type === 'dpo' && !data.rejected_ref) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rejected_ref'],
      message: 'rejected_ref is required when dataset_type is dpo',
    });
  }
});
export type TrainingCandidatePayload = z.infer<typeof TrainingCandidatePayloadSchema>;

// ==========================================
// 11. 커밋 추천 결과 (AI pipeline 내부)
// ==========================================

export const BranchSuggestionSchema = z.object({
  names: z.array(z.string()),
});
export type BranchSuggestion = z.infer<typeof BranchSuggestionSchema>;

export const CommitSuggestionSchema = z.object({
  messages: z.array(z.string()),
  branch_names: z.array(z.string()),
  description: z.string(),
});
export type CommitSuggestion = z.infer<typeof CommitSuggestionSchema>;

export const PRSuggestionSchema = z.object({
  title: z.string(),
  markdown: z.string(),
});
export type PRSuggestion = z.infer<typeof PRSuggestionSchema>;

export const RecommendationSuggestionSchema = z.discriminatedUnion('recommendation_type', [
  z.object({
    recommendation_type: z.literal('branch_name'),
    result: BranchSuggestionSchema,
  }),
  z.object({
    recommendation_type: z.literal('commit_message'),
    result: CommitSuggestionSchema,
  }),
  z.object({
    recommendation_type: z.literal('pr_description'),
    result: PRSuggestionSchema,
  }),
]);
export type RecommendationSuggestion = z.infer<typeof RecommendationSuggestionSchema>;

// ==========================================
// 12. Parsed AI 결과 (Service 간 전달용 DTO)
// ==========================================

export interface ParsedAiResultBase {
  proposal_id: string;
  session_id: string;
  ai_request_id: string;
  feature_type: FeatureType;
  title: string;
  summary: string;
  proposal_status: z.infer<typeof MergeProposalStatusEnum>;
  parser_version: string;
  explanation?: string;
  confidence_score?: number;
}

export interface MergePatchDraftResult extends ParsedAiResultBase {
  feature_type: 'merge_patch_draft';
  diff_patch_ref?: string;
  merged_code_ref?: string;
  applied_files: string[];
  validation_required: boolean;
  validation_summary: string;
}

export interface ConflictExplanationResult extends ParsedAiResultBase {
  feature_type: 'conflict_explanation';
  cause_summary: string;
  detailed_explanation: string;
  related_files: string[];
  recommended_resolution_direction: string;
  risk_level: RiskLevel;
}

export interface MergeMediationResult extends ParsedAiResultBase {
  feature_type: 'merge_mediation';
  recommended_option: string;
  tradeoffs: string[];
  recommended_next_action: string;
}

export interface RecommendationResult extends ParsedAiResultBase {
  feature_type: 'recommendation';
  recommendation_type: RecommendationType;
  primary_text: string;
  alternative_texts: string[];
  generation_basis_summary?: string;
  format_notes?: string;
  warnings?: string[];
}

export type ParsedAiResult =
  | MergePatchDraftResult
  | ConflictExplanationResult
  | MergeMediationResult
  | RecommendationResult;

// ==========================================
// 13. Diff 결과 (DiffResult)
// ==========================================

export const DiffResultSchema = z.object({
  file_path: z.string(),
  hunks: z.array(z.string()),
});
export type DiffResult = z.infer<typeof DiffResultSchema>;

// ==========================================
// 14. PR 추천용 Raw Data DTO
// ==========================================

export const LogEntrySchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  message: z.string(),
  author: z.string(),
  authorEmail: z.string().optional(),
  date: z.string(),
  body: z.string().optional(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const PRRecommendationInputSchema = z.object({
  baseBranch: z.string(),
  currentBranch: z.string(),
  diffText: z.string(),
  commits: z.array(LogEntrySchema),
});
export type PRRecommendationInput = z.infer<typeof PRRecommendationInputSchema>;

export const PRRecommendationResultSchema = PRSuggestionSchema;
export type PRRecommendationResult = PRSuggestion;
