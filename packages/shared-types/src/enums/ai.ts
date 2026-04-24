import { z } from 'zod';

// ==========================================
// 1. Core AI Enums
// ==========================================

// ai_requests.feature_type
export const FeatureTypeEnum = z.enum([
  'conflict_explanation',
  'merge_mediation',
  'merge_patch_draft',
  'recommendation',
]);
export type FeatureType = z.infer<typeof FeatureTypeEnum>;

// recommendation_histories.recommendation_type
export const RecommendationTypeEnum = z.enum([
  'commit_message',
  'branch_name',
  'work_description',
]);
export type RecommendationType = z.infer<typeof RecommendationTypeEnum>;

// ai_requests.request_origin
export const RequestOriginEnum = z.enum([
  'panel',
  'treeview',
  'command_palette',
  'inline_action',
]);
export type RequestOrigin = z.infer<typeof RequestOriginEnum>;

// work_sessions.session_type
export const SessionTypeEnum = z.enum([
  'ai_work',
  'manual',
  'pre_restore',
  'pre_merge',
]);
export type SessionType = z.infer<typeof SessionTypeEnum>;

// ai_requests.request_status
export const RequestStatusEnum = z.enum([
  'queued',
  'analyzing',
  'completed',
  'failed',
]);
export type RequestStatus = z.infer<typeof RequestStatusEnum>;

// merge_proposals.status
export const MergeProposalStatusEnum = z.enum([
  'generated',
  'displayed',
  'accepted',
  'completed',
  'failed',
]);
export type MergeProposalStatus = z.infer<typeof MergeProposalStatusEnum>;

// proposal_feedbacks.selection_status
export const SelectionStatusEnum = z.enum([
  'accepted',
  'edited',
  'rejected',
]);
export type SelectionStatus = z.infer<typeof SelectionStatusEnum>;

// proposal_feedbacks.quality_tag
export const QualityTagEnum = z.enum([
  'useful',
  'partially_useful',
  'not_useful',
  'incorrect',
  'unsafe',
  'needs_followup',
]);
export type QualityTag = z.infer<typeof QualityTagEnum>;

// ==========================================
// 2. Git / Repository Enums
// ==========================================

// snapshots.reason
export const SnapshotReasonEnum = z.enum([
  'ai_work',
  'manual',
  'pre_restore',
  'pre_merge',
]);
export type SnapshotReason = z.infer<typeof SnapshotReasonEnum>;

// changed_files.change_type — ERD에 'renamed' 포함
export const ChangeTypeEnum = z.enum([
  'added',
  'modified',
  'deleted',
  'renamed',
]);
export type ChangeType = z.infer<typeof ChangeTypeEnum>;

// ==========================================
// 3. Conflict / Merge Enums
// ==========================================

// conflict_candidates.detected_by
export const DetectionMethodEnum = z.enum([
  'diff',
  'ast',
  'both',
]);
export type DetectionMethod = z.infer<typeof DetectionMethodEnum>;

// merge_analyses.status
export const MergeAnalysisStatusEnum = z.enum([
  'pending',
  'analyzing',
  'completed',
  'failed',
]);
export type MergeAnalysisStatus = z.infer<typeof MergeAnalysisStatusEnum>;

// ==========================================
// 4. Inference / AI Model Enums
// ==========================================

// inference_runs.run_type (from ERD ENUM list)
export const InferenceRunTypeEnum = z.enum([
  'conflict_explanation',
  'merge_mediation',
  'merge_patch_draft',
  'recommendation',
]);
export type InferenceRunType = z.infer<typeof InferenceRunTypeEnum>;

// inference_runs.status
export const InferenceRunStatusEnum = z.enum([
  'queued',
  'calling',
  'succeeded',
  'failed',
  'timeout',
  'cancelled',
]);
export type InferenceRunStatus = z.infer<typeof InferenceRunStatusEnum>;

// ai_requests.response_format
export const ResponseFormatEnum = z.enum([
  'plain_text',
  'structured_json',
  'markdown',
  'diff_patch',
  'mixed',
]);
export type ResponseFormat = z.infer<typeof ResponseFormatEnum>;

// ==========================================
// 5. Training / Dataset Enums
// ==========================================

// training_candidates.dataset_type
export const DatasetTypeEnum = z.enum([
  'sft',
  'dpo',
  'eval',
]);
export type DatasetType = z.infer<typeof DatasetTypeEnum>;

// training_candidates.source_type
export const SourceTypeEnum = z.enum([
  'merge_proposal',
  'conflict_explanation',
  'recommendation',
]);
export type SourceType = z.infer<typeof SourceTypeEnum>;

// ==========================================
// 6. Risk / General Enums
// ==========================================

export const RiskLevelEnum = z.enum([
  'low',
  'medium',
  'high',
  'critical',
]);
export type RiskLevel = z.infer<typeof RiskLevelEnum>;

export const TriggerSourceEnum = z.enum([
  'manual',
  'merge_detected',
  'restore_related',
  'recommendation_request',
]);
export type TriggerSource = z.infer<typeof TriggerSourceEnum>;
