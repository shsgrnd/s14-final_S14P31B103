import { z } from 'zod';
import { BranchStatusEnum, GitFileStatusTypeEnum } from '../enums/git';

/**
 * Git 파일의 개별 상태 정보
 */
export const GitFileStatusSchema = z.object({
  path: z.string(),
  status: GitFileStatusTypeEnum,
  additions: z.number().optional(),
  deletions: z.number().optional(),
});
export type GitFileStatus = z.infer<typeof GitFileStatusSchema>;

/**
 * 워크트리 데이터 인터페이스
 */
export const WorktreeInfoSchema = z.object({
  path: z.string(),
  head: z.string().optional(),
  branch: z.string().optional(),
  isMain: z.boolean(),
  isLocked: z.boolean().optional(),
});
export type WorktreeInfo = z.infer<typeof WorktreeInfoSchema>;

/**
 * 전체 Git 상태 인터페이스
 */
export const GitStatusSchema = z.object({
  repoRoot: z.string().optional(),
  currentWorktreePath: z.string().optional(),
  branch: z.string(),
  currentBranch: z.string().optional(),
  isDetachedHead: z.boolean().optional(),
  ahead: z.number().optional(),
  behind: z.number().optional(),
  isMergeInProgress: z.boolean(),
  isConflict: z.boolean().optional(),
  isMerging: z.boolean().optional(),
  isRebasing: z.boolean().optional(),
  staged: z.array(GitFileStatusSchema),
  unstaged: z.array(GitFileStatusSchema),
  untracked: z.array(GitFileStatusSchema),
  conflicted: z.array(GitFileStatusSchema),
  worktrees: z.array(WorktreeInfoSchema).optional(),
});
export type GitStatus = z.infer<typeof GitStatusSchema>;

/**
 * 브랜치 데이터 인터페이스
 */
export const BranchSchema = z.object({
  name: z.string(),
  isCurrent: z.boolean(),
  isRemote: z.boolean(),
  trackingBranch: z.string().optional(),
  status: BranchStatusEnum,
  lastActivity: z.string(), // ISO Date String
  lastCommitHash: z.string().optional(),
  lastCommitMessage: z.string().optional(),
  isMerged: z.boolean().optional(),
});
export type Branch = z.infer<typeof BranchSchema>;

/**
 * 워크트리 데이터 인터페이스
 */
export type WorkspaceFileTreeNode = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  status?: GitFileStatus['status'];
  children?: WorkspaceFileTreeNode[];
};

export const WorkspaceFileTreeNodeSchema: z.ZodType<WorkspaceFileTreeNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['file', 'directory']),
    status: GitFileStatusTypeEnum.optional(),
    children: z.array(WorkspaceFileTreeNodeSchema).optional(),
  }),
);

export const WorkspaceTreeSchema = z.object({
  rootName: z.string(),
  nodes: z.array(WorkspaceFileTreeNodeSchema),
  totalFiles: z.number(),
  truncated: z.boolean(),
});
export type WorkspaceTree = z.infer<typeof WorkspaceTreeSchema>;

/**
 * Git 명령 실행 결과
 */
export const GitResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});
export type GitResult = z.infer<typeof GitResultSchema>;

/**
 * 병합 실행 결과
 */
export const MergeResultSchema = GitResultSchema.extend({
  hasConflicts: z.boolean(),
  conflictFiles: z.array(z.string()).optional(),
});
export type MergeResult = z.infer<typeof MergeResultSchema>;

/**
 * 스냅샷 내 개별 파일 정보
 */
export const SnapshotFileSchema = z.object({
  path: z.string(),
  status: z.enum(['MODIFIED', 'ADDED', 'DELETED']),
  added: z.number().optional(),
  removed: z.number().optional(),
});
export type SnapshotFile = z.infer<typeof SnapshotFileSchema>;

/**
 * 스냅샷 데이터 인터페이스
 */
export const SnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  timestamp: z.number(),
  type: z.enum(['AI_TASK', 'BEFORE_MERGE', 'MANUAL', 'SAFETY_BACKUP']),
  isStarred: z.boolean(),
  changesCount: z.number(),
  description: z.string().optional(),
  reason: z.string().optional(),
  snapshotPath: z.string().optional(),
  files: z.array(SnapshotFileSchema).optional(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

/**
 * 충돌 분석 결과 인터페이스
 */
export const ConflictAnalysisSchema = z.object({
  filePath: z.string(),
  lineRange: z.tuple([z.number(), z.number()]),
  severity: z.enum(['high', 'medium', 'low']),
  reason: z.string(),
  suggestion: z.string().optional(),
});
export type ConflictAnalysis = z.infer<typeof ConflictAnalysisSchema>;

/**
 * AI 병합 초안 인터페이스
 */
export const AIDraftSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  originalContent: z.string(),
  proposedContent: z.string(),
  mediationOpinion: z.string(),
});
export type AIDraft = z.infer<typeof AIDraftSchema>;

/**
 * 브랜치 자동 정리 설정
 */
export const BranchCleanupSettingsSchema = z.object({
  enabled: z.boolean(),
  olderThanValue: z.number(),
  olderThanUnit: z.enum(['week', 'month']),
  deleteMergedBranches: z.boolean(),
  deleteGoneRemoteBranches: z.boolean(),
  protectedBranches: z.array(z.string()),
});
export type BranchCleanupSettings = z.infer<typeof BranchCleanupSettingsSchema>;

/**
 * 브랜치 정리 후보
 */
export const BranchCleanupCandidateSchema = z.object({
  branchName: z.string(),
  isCurrent: z.boolean(),
  isProtected: z.boolean(),
  lastCommitDate: z.string(), // ISO Date String
  isOlderThanThreshold: z.boolean(),
  isMerged: z.boolean(),
  isGoneRemote: z.boolean(),
  shouldDelete: z.boolean(),
  reasons: z.array(z.string()),
  skipReason: z.string().optional(),
});
export type BranchCleanupCandidate = z.infer<typeof BranchCleanupCandidateSchema>;

/**
 * 브랜치 정리 미리보기 결과
 */
export const BranchCleanupPreviewResultSchema = z.object({
  settings: BranchCleanupSettingsSchema,
  baseBranch: z.string(),
  candidates: z.array(BranchCleanupCandidateSchema),
  deletableCount: z.number(),
  skippedCount: z.number(),
});
export type BranchCleanupPreviewResult = z.infer<typeof BranchCleanupPreviewResultSchema>;

/**
 * 브랜치 정리 실행 결과
 */
export const BranchCleanupExecuteResultSchema = z.object({
  deletedBranches: z.array(z.string()),
  failedBranches: z.array(z.string()),
  skippedBranches: z.array(z.string()),
  summary: z.string(),
});
export type BranchCleanupExecuteResult = z.infer<typeof BranchCleanupExecuteResultSchema>;

