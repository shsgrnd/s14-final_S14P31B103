import { z } from 'zod';
import {
  MergeAnalysisStatusEnum,
  DetectionMethodEnum,
  FeatureTypeEnum,
  ProposalStatusEnum,
  QualityTagEnum,
  RecommendationTypeEnum,
  SelectionStatusEnum,
  SnapshotReasonEnum,
  SessionTypeEnum,
  WorkSessionStatusEnum,
  ChangeTypeEnum,
} from '../enums/ai';

// ==========================================
// 1. Core Metadata Tables
// ==========================================

export const UserRowSchema = z.object({
  user_id: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const DeviceRowSchema = z.object({
  device_id: z.string(),
  user_id: z.string(),
  device_name: z.string().nullable(),
  device_type: z.string().nullable(),
  os_type: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ProjectRowSchema = z.object({
  project_id: z.string(),
  user_id: z.string(),
  project_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ProjectWorkspaceRowSchema = z.object({
  project_workspace_id: z.string(),
  device_id: z.string(),
  project_id: z.string(),
  workspace_root_path: z.string(),
  git_root_path: z.string(),
  last_opened_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const BranchRowSchema = z.object({
  branch_id: z.string(),
  project_id: z.string(),
  branch_name: z.string(),
  is_remote: z.number().int(), // SQLite Boolean (0 or 1)
  tracking_branch_name: z.string().nullable(),
  last_commit_hash: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const WorktreeRowSchema = z.object({
  worktree_id: z.string(),
  project_id: z.string(),
  worktree_path: z.string(),
  is_main: z.number().int(),
  is_active: z.number().int(),
  last_opened_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const WorktreeInstanceRowSchema = z.object({
  worktree_instance_id: z.string(),
  worktree_id: z.string(),
  branch_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

// ==========================================
// 2. Session & History Tables
// ==========================================

export const WorkSessionRowSchema = z.object({
  session_id: z.string(),
  worktree_instance_id: z.string(),
  session_type: SessionTypeEnum,
  base_snapshot_id: z.string().nullable(),
  description: z.string().nullable(),
  status: WorkSessionStatusEnum,
  started_at: z.string(),
  ended_at: z.string().nullable(),
});

export const SnapshotRowSchema = z.object({
  snapshot_id: z.string(),
  session_id: z.string(),
  reason: SnapshotReasonEnum,
  is_checkpoint: z.number().int(),
  label: z.string().nullable(),
  created_at: z.string(),
});

export const SnapshotFileRowSchema = z.object({
  snapshot_file_id: z.string(),
  snapshot_id: z.string(),
  original_path: z.string(),
  stored_path: z.string(),
  file_name: z.string(),
  content_hash: z.string().nullable(),
  created_at: z.string(),
});

export const ChangeRecordRowSchema = z.object({
  record_id: z.string(),
  session_id: z.string(),
  branch_name: z.string().nullable(),
  description: z.string().nullable(),
  created_at: z.string(),
});

export const ChangedFileRowSchema = z.object({
  changed_file_id: z.string(),
  record_id: z.string(),
  file_path: z.string(),
  change_type: ChangeTypeEnum,
  location: z.string().nullable(),
  summary: z.string().nullable(),
  created_at: z.string(),
});

export const RestoreHistoryRowSchema = z.object({
  restore_history_id: z.string(),
  target_snapshot_id: z.string(),
  pre_restore_snapshot_id: z.string().nullable(),
  restored_at: z.string(),
});

// ==========================================
// 3. AI Analysis & Feedback Tables
// ==========================================

export const MergeAnalysisRowSchema = z.object({
  analysis_id: z.string(),
  source_worktree_instance_id: z.string(),
  target_worktree_instance_id: z.string(),
  merge_base: z.string().nullable(),
  status: MergeAnalysisStatusEnum,
  analysis_artifact_path: z.string().nullable(),
  proposals_artifact_path: z.string().nullable(),
  created_at: z.string(),
});

export const ConflictCandidateRowSchema = z.object({
  candidate_id: z.string(),
  analysis_id: z.string(),
  file_path: z.string(),
  line_start: z.number().int().nullable(),
  line_end: z.number().int().nullable(),
  detected_by: DetectionMethodEnum,
  confidence_score: z.number().min(0).max(1).nullable(),
  created_at: z.string(),
});

export const MergeProposalRowSchema = z.object({
  proposal_id: z.string(),
  candidate_id: z.string(),
  ai_request_id: z.string().nullable(),
  file_path: z.string(),
  feature_type: FeatureTypeEnum,
  title: z.string(),
  explanation_summary: z.string().nullable(),
  confidence_score: z.number().min(0).max(1).nullable(),
  validation_required: z.number().int(),
  validation_summary: z.string().nullable(),
  status: ProposalStatusEnum,
  created_at: z.string(),
});

export const ProposalFeedbackRowSchema = z.object({
  feedback_id: z.string(),
  proposal_id: z.string(),
  project_id: z.string(),
  merge_proposal_id: z.string().nullable(),
  selection_status: SelectionStatusEnum,
  final_text: z.string().nullable(),
  final_code_ref: z.string().nullable(),
  final_explanation: z.string().nullable(),
  quality_tag: QualityTagEnum.nullable(),
  feedback_note: z.string().nullable(),
  decided_at: z.string(),
});

export const RecommendationHistoryRowSchema = z.object({
  recommendation_id: z.string(),
  project_id: z.string(),
  session_id: z.string().nullable(),
  ai_request_id: z.string().nullable(),
  recommendation_type: RecommendationTypeEnum,
  input_summary: z.string().nullable(),
  result_text: z.string(),
  alternative_texts_json: z.string().nullable(),
  generation_basis_summary: z.string().nullable(),
  followup_notes: z.string().nullable(),
  warnings_json: z.string().nullable(),
  created_at: z.string(),
});

// ==========================================
// 4. App State & Settings
// ==========================================

export const AppStateRowSchema = z.object({
  app_state_id: z.string(),
  device_id: z.string(),
  state_key: z.string(),
  state_value_json: z.string().nullable(),
  updated_at: z.string(),
});

export const AppSettingRowSchema = z.object({
  app_setting_id: z.string(),
  device_id: z.string(),
  setting_key: z.string(),
  setting_value_json: z.string().nullable(),
  updated_at: z.string(),
});
