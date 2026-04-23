import { z } from 'zod';

// ==========================================
// 1. Core AI Enums (snake_case)
// ==========================================

export const FeatureTypeEnum = z.enum([
  'conflict_explanation',
  'merge_mediation',
  'merge_patch_draft',
  'recommendation',
]);
export type FeatureType = z.infer<typeof FeatureTypeEnum>;

export const RecommendationTypeEnum = z.enum([
  'commit_message',
  'branch_name',
  'work_description',
]);
export type RecommendationType = z.infer<typeof RecommendationTypeEnum>;

export const RequestOriginEnum = z.enum([
  'panel',
  'treeview',
  'command_palette',
  'inline_action',
]);
export type RequestOrigin = z.infer<typeof RequestOriginEnum>;

export const TriggerSourceEnum = z.enum([
  'manual',
  'merge_detected',
  'restore_related',
  'recommendation_request',
]);
export type TriggerSource = z.infer<typeof TriggerSourceEnum>;

export const ResponseFormatEnum = z.enum([
  'plain_text',
  'structured_json',
  'markdown',
  'diff_patch',
  'mixed',
]);
export type ResponseFormat = z.infer<typeof ResponseFormatEnum>;

export const RequestStatusEnum = z.enum([
  'queued',
  'calling',
  'succeeded',
  'failed',
  'timeout',
  'cancelled',
]);
export type RequestStatus = z.infer<typeof RequestStatusEnum>;

export const ProposalStatusEnum = z.enum([
  'generated',
  'parsed',
  'displayed',
  'accepted',
  'edited',
  'rejected',
  'archived',
]);
export type ProposalStatus = z.infer<typeof ProposalStatusEnum>;

export const SelectionStatusEnum = z.enum([
  'accepted',
  'edited',
  'rejected',
]);
export type SelectionStatus = z.infer<typeof SelectionStatusEnum>;

export const QualityTagEnum = z.enum([
  'useful',
  'partially_useful',
  'not_useful',
  'incorrect',
  'unsafe',
  'needs_followup',
]);
export type QualityTag = z.infer<typeof QualityTagEnum>;

export const RiskLevelEnum = z.enum([
  'low',
  'medium',
  'high',
  'critical',
]);
export type RiskLevel = z.infer<typeof RiskLevelEnum>;

export const DatasetTypeEnum = z.enum([
  'sft',
  'dpo',
  'eval',
]);
export type DatasetType = z.infer<typeof DatasetTypeEnum>;

export const SourceTypeEnum = z.enum([
  'merge_proposal',
  'conflict_explanation',
  'recommendation',
]);
export type SourceType = z.infer<typeof SourceTypeEnum>;

export const ConflictTypeEnum = z.enum([
  'same_region',
  'adjacent_change',
  'signature_change',
  'shared_module_impact',
  'data_structure_change',
]);
export type ConflictType = z.infer<typeof ConflictTypeEnum>;

// ==========================================
// 2. Updated Specs (from 06_data_type_interface_spec)
// ==========================================

export const SnapshotReasonEnum = z.enum([
  'ai_work',
  'manual',
  'pre_merge',
  'pre_restore',
]);
export type SnapshotReason = z.infer<typeof SnapshotReasonEnum>;

export const ChangeTypeEnum = z.enum([
  'added',
  'deleted',
  'modified',
]);
export type ChangeType = z.infer<typeof ChangeTypeEnum>;

export const ConfidenceEnum = z.enum([
  'high',
  'low',
  'medium',
]);
export type Confidence = z.infer<typeof ConfidenceEnum>;

export const DetectionMethodEnum = z.enum([
  'ast',
  'both',
  'diff',
]);
export type DetectionMethod = z.infer<typeof DetectionMethodEnum>;

export const CommitTagEnum = z.enum([
  'docs',
  'feat',
  'fix',
  'refactor',
]);
export type CommitTag = z.infer<typeof CommitTagEnum>;

export const ErrorCodeEnum = z.enum([
  'AI_RESPONSE_FAILED',
  'BRANCH_DELETE_FAILED',
  'GIT_OPERATION_FAILED',
  'RESTORE_FAILED',
  'SCHEMA_VALIDATION_FAILED',
  'SNAPSHOT_WRITE_FAILED',
  'UNKNOWN',
]);
export type ErrorCode = z.infer<typeof ErrorCodeEnum>;
