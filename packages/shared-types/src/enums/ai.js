"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConflictTypeEnum = exports.TriggerSourceEnum = exports.RiskLevelEnum = exports.SourceTypeEnum = exports.DatasetTypeEnum = exports.ResponseFormatEnum = exports.InferenceRunStatusEnum = exports.InferenceRunTypeEnum = exports.MergeAnalysisStatusEnum = exports.DetectionMethodEnum = exports.ChangeTypeEnum = exports.SnapshotReasonEnum = exports.QualityTagEnum = exports.SelectionStatusEnum = exports.ProposalStatusEnum = exports.MergeProposalStatusEnum = exports.ErrorCodeEnum = exports.RequestStatusEnum = exports.SessionTypeEnum = exports.RequestOriginEnum = exports.RecommendationTypeEnum = exports.FeatureTypeEnum = void 0;
const zod_1 = require("zod");
// ==========================================
// 1. Core AI Enums
// ==========================================
// ai_requests.feature_type
exports.FeatureTypeEnum = zod_1.z.enum([
    'conflict_explanation',
    'merge_mediation',
    'merge_patch_draft',
    'recommendation',
]);
// recommendation_histories.recommendation_type
exports.RecommendationTypeEnum = zod_1.z.enum([
    'commit_message',
    'branch_name',
    'work_description',
]);
// ai_requests.request_origin
exports.RequestOriginEnum = zod_1.z.enum([
    'panel',
    'treeview',
    'command_palette',
    'inline_action',
]);
// work_sessions.session_type
exports.SessionTypeEnum = zod_1.z.enum([
    'ai_work',
    'manual',
    'pre_restore',
    'pre_merge',
]);
// ai_requests.request_status
exports.RequestStatusEnum = zod_1.z.enum([
    'queued',
    'analyzing',
    'completed',
    'failed',
]);
// ai message error codes
exports.ErrorCodeEnum = zod_1.z.enum([
    'UNKNOWN',
    'INVALID_INPUT',
    'NOT_FOUND',
    'INTERNAL',
]);
// merge_proposals.status
exports.MergeProposalStatusEnum = zod_1.z.enum([
    'generated',
    'displayed',
    'accepted',
    'completed',
    'failed',
]);
exports.ProposalStatusEnum = exports.MergeProposalStatusEnum;
// proposal_feedbacks.selection_status
exports.SelectionStatusEnum = zod_1.z.enum([
    'accepted',
    'edited',
    'rejected',
]);
// proposal_feedbacks.quality_tag
exports.QualityTagEnum = zod_1.z.enum([
    'useful',
    'partially_useful',
    'not_useful',
    'incorrect',
    'unsafe',
    'needs_followup',
]);
// ==========================================
// 2. Git / Repository Enums
// ==========================================
// snapshots.reason
exports.SnapshotReasonEnum = zod_1.z.enum([
    'ai_work',
    'manual',
    'pre_restore',
    'pre_merge',
]);
// changed_files.change_type — ERD에 'renamed' 포함
exports.ChangeTypeEnum = zod_1.z.enum([
    'added',
    'modified',
    'deleted',
    'renamed',
]);
// ==========================================
// 3. Conflict / Merge Enums
// ==========================================
// conflict_candidates.detected_by
exports.DetectionMethodEnum = zod_1.z.enum([
    'diff',
    'ast',
    'both',
]);
// merge_analyses.status
exports.MergeAnalysisStatusEnum = zod_1.z.enum([
    'pending',
    'analyzing',
    'completed',
    'failed',
]);
// ==========================================
// 4. Inference / AI Model Enums
// ==========================================
// inference_runs.run_type (from ERD ENUM list)
exports.InferenceRunTypeEnum = zod_1.z.enum([
    'conflict_explanation',
    'merge_mediation',
    'merge_patch_draft',
    'recommendation',
]);
// inference_runs.status
exports.InferenceRunStatusEnum = zod_1.z.enum([
    'queued',
    'calling',
    'succeeded',
    'failed',
    'timeout',
    'cancelled',
]);
// ai_requests.response_format
exports.ResponseFormatEnum = zod_1.z.enum([
    'plain_text',
    'structured_json',
    'markdown',
    'diff_patch',
    'mixed',
]);
// ==========================================
// 5. Training / Dataset Enums
// ==========================================
// training_candidates.dataset_type
exports.DatasetTypeEnum = zod_1.z.enum([
    'sft',
    'dpo',
    'eval',
]);
// training_candidates.source_type
exports.SourceTypeEnum = zod_1.z.enum([
    'merge_proposal',
    'conflict_explanation',
    'recommendation',
]);
// ==========================================
// 6. Risk / General Enums
// ==========================================
exports.RiskLevelEnum = zod_1.z.enum([
    'low',
    'medium',
    'high',
    'critical',
]);
exports.TriggerSourceEnum = zod_1.z.enum([
    'manual',
    'merge_detected',
    'restore_related',
    'recommendation_request',
]);
exports.ConflictTypeEnum = zod_1.z.enum([
    'same_region',
    'adjacent_change',
    'signature_change',
    'shared_module_impact',
    'data_structure_change',
]);
//# sourceMappingURL=ai.js.map