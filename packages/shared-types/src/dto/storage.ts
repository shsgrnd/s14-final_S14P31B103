import { z } from 'zod';
import * as schemas from '../schemas/storage';

/**
 * users 테이블 Row
 */
export type UserRow = z.infer<typeof schemas.UserRowSchema>;

/**
 * devices 테이블 Row
 */
export type DeviceRow = z.infer<typeof schemas.DeviceRowSchema>;

/**
 * projects 테이블 Row
 */
export type ProjectRow = z.infer<typeof schemas.ProjectRowSchema>;

/**
 * project_workspaces 테이블 Row
 */
export type ProjectWorkspaceRow = z.infer<typeof schemas.ProjectWorkspaceRowSchema>;

/**
 * branches 테이블 Row
 */
export type BranchRow = z.infer<typeof schemas.BranchRowSchema>;

/**
 * worktrees 테이블 Row
 */
export type WorktreeRow = z.infer<typeof schemas.WorktreeRowSchema>;

/**
 * worktree_instances 테이블 Row
 */
export type WorktreeInstanceRow = z.infer<typeof schemas.WorktreeInstanceRowSchema>;

/**
 * work_sessions 테이블 Row
 */
export type WorkSessionRow = z.infer<typeof schemas.WorkSessionRowSchema>;

/**
 * snapshots 테이블 Row
 */
export type SnapshotRow = z.infer<typeof schemas.SnapshotRowSchema>;

/**
 * snapshot_files 테이블 Row
 */
export type SnapshotFileRow = z.infer<typeof schemas.SnapshotFileRowSchema>;

/**
 * change_records 테이블 Row
 */
export type ChangeRecordRow = z.infer<typeof schemas.ChangeRecordRowSchema>;

/**
 * changed_files 테이블 Row
 */
export type ChangedFileRow = z.infer<typeof schemas.ChangedFileRowSchema>;

/**
 * restore_histories 테이블 Row
 */
export type RestoreHistoryRow = z.infer<typeof schemas.RestoreHistoryRowSchema>;

/**
 * merge_analyses 테이블 Row
 */
export type MergeAnalysisRow = z.infer<typeof schemas.MergeAnalysisRowSchema>;

/**
 * conflict_candidates 테이블 Row
 */
export type ConflictCandidateRow = z.infer<typeof schemas.ConflictCandidateRowSchema>;

/**
 * merge_proposals 테이블 Row
 */
export type MergeProposalRow = z.infer<typeof schemas.MergeProposalRowSchema>;

/**
 * proposal_feedbacks 테이블 Row
 */
export type ProposalFeedbackRow = z.infer<typeof schemas.ProposalFeedbackRowSchema>;

/**
 * recommendation_histories 테이블 Row
 */
export type RecommendationHistoryRow = z.infer<typeof schemas.RecommendationHistoryRowSchema>;

/**
 * app_states 테이블 Row
 */
export type AppStateRow = z.infer<typeof schemas.AppStateRowSchema>;

/**
 * app_settings 테이블 Row
 */
export type AppSettingRow = z.infer<typeof schemas.AppSettingRowSchema>;
