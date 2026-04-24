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

// 명세서(05번): getStatus() 반환 타입
export const GitStatusSchema = z.object({
  current: z.string(),
  staged: z.array(z.string()),
  unstaged: z.array(z.string()),
  untracked: z.array(z.string()),
  conflicted: z.array(z.string()),
});
export type GitStatus = z.infer<typeof GitStatusSchema>;

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

// 추천 기능 payload
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
  merge_proposal_id: z.string().optional(),
  session_id: z.string(),
  selection_status: SelectionStatusEnum,
  input_summary: z.string().optional(),
  response_ref: z.string().optional(),
  feedback_note: z.string().optional(),
  quality_tag: QualityTagEnum.optional(),
  decided_at: z.string(),
});
export type ProposalFeedback = z.infer<typeof ProposalFeedbackSchema>;

// ==========================================
// 10. 커밋 추천 결과 (AI pipeline 내부)
// ==========================================

export const CommitSuggestionSchema = z.object({
  messages: z.array(z.string()),
  branch_names: z.array(z.string()),
  description: z.string(),
});
export type CommitSuggestion = z.infer<typeof CommitSuggestionSchema>;
