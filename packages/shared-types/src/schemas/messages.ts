import { z } from 'zod';
import { ErrorCodeEnum } from '../enums/error-codes';
import { InboundMessageTypeEnum, OutboundMessageTypeEnum } from '../enums/messages';
import {
  BranchSuggestionSchema,
  CommitSuggestionSchema,
  ConflictCandidateSchema,
  MergeProposalSchema,
  PRSuggestionSchema,
} from '../dto/ai';
import {
  SnapshotSchema,
  ConflictAnalysisSchema,
  AIDraftSchema,
  BranchSchema,
  GitResultSchema,
  GitStatusSchema,
  GitStatusSummarySchema,
  WorktreeInfoSchema,
  WorkspaceTreeSchema,
  BranchCleanupSettingsSchema,
  BranchCleanupCandidateSchema,
  BranchCleanupPreviewResultSchema,
  BranchCleanupExecuteResultSchema,
} from '../dto/git';

/**
 * 메시지 공통 봉투(envelope) 구조입니다.
 *
 * 실제 type별 상세 검증 전에 최소한의 공통 필드 존재 여부를 확인하거나,
 * 라우터 로깅/트레이싱에서 requestId를 추적할 때 사용합니다.
 */
export const EnvelopeSchema = z.object({
  type: z.string(),
  payload: z.unknown().optional(),
  requestId: z.string().optional(),
});

/**
 * Webview -> Extension 방향 payload 검증 스키마 맵입니다.
 *
 * 키는 메시지 type, 값은 해당 type에서 허용되는 payload 스키마입니다.
 * `as const`를 사용해 키 리터럴 타입을 고정해야
 * 이후 mapped type에서 type별 payload 추론이 정확히 동작합니다.
 */
export const InboundPayloadSchemaMap = {
  RESTORE_SNAPSHOT: z.object({ snapshotId: z.string() }),
  ANALYZE_CONFLICT: z.object({ source: z.string(), target: z.string() }),
  ACCEPT_MERGE: z.object({ filePath: z.string(), code: z.string() }),
  REJECT_MERGE: z.object({ filePath: z.string() }),
  RUN_MERGE: z.object({ source: z.string(), target: z.string() }),
  RECOMMEND_COMMIT: z.object({ diffText: z.string().min(1), tag: z.string().optional() }),
  RECOMMEND_BRANCH: z.object({ purpose: z.string().min(1) }),
  RECOMMEND_PR: z.object({ base: z.string().min(1) }),
  APPLY_COMMIT: z.object({ message: z.string().min(1), body: z.string().optional() }),
  APPLY_BRANCH: z.object({ name: z.string().min(1) }),
  DELETE_BRANCHES: z.object({ names: z.array(z.string().min(1)).min(1), force: z.boolean() }),
  GIT_STAGE_FILES: z.object({ paths: z.array(z.string().min(1)).min(1) }),
  GIT_UNSTAGE_FILES: z.object({ paths: z.array(z.string().min(1)).min(1) }),
  GIT_DISCARD_CHANGES: z.object({ paths: z.array(z.string().min(1)).min(1) }),
  GIT_STASH_SAVE: z.object({ message: z.string().optional(), includeUntracked: z.boolean().optional() }),
  GIT_STASH_POP: z.object({ stashRef: z.string().optional() }),
  GIT_STASH_APPLY: z.object({ stashRef: z.string().optional() }),
  GIT_STASH_DROP: z.object({ stashRef: z.string().optional() }),
  GIT_MERGE_ABORT: z.object({}).strict(),
  GIT_MERGE_CONTINUE: z.object({}).strict(),
  DELETE_SNAPSHOT: z.object({ snapshotId: z.string() }),
  SET_CHECKPOINT: z.object({ snapshotId: z.string() }),
  REFRESH_STATUS: z.object({ fetchRemote: z.boolean().optional() }).strict(),
  GET_GIT_STATUS_SUMMARY: z.object({ fetchRemote: z.boolean().optional() }).strict(),
  GET_SNAPSHOT_LIST: z.object({}).strict(),
  GET_BRANCH_LIST: z.object({}).strict(),
  GET_WORKTREE_LIST: z.object({}).strict(),
  GET_WORKSPACE_TREE: z.object({}).strict(),
  // 추가된 메시지 스키마
  CREATE_SNAPSHOT: z.object({ title: z.string().optional() }),
  RENAME_SNAPSHOT: z.object({ snapshotId: z.string(), newTitle: z.string() }),
  TOGGLE_SNAPSHOT_STAR: z.object({ snapshotId: z.string() }),
  GET_SNAPSHOT_FILES: z.object({ snapshotId: z.string() }),
  OPEN_FILE_DIFF: z.object({ filePath: z.string(), snapshotId: z.string().optional() }),
  OPEN_WORKSPACE_FILE: z.object({ filePath: z.string(), status: z.string().optional() }),
  EXECUTE_PULL: z.object({}).strict(),
  OPEN_DIFF_EDITOR: z.object({ filePath: z.string() }),
  SET_CONFIG: z.object({ config: z.any() }),
  GET_AI_DRAFT: z.object({ filePath: z.string() }),
  EXECUTE_COMMIT: z.object({ message: z.string() }),
  GIT_ADD_ALL: z.object({}).strict(),
  GIT_PUSH: z.object({}).strict(),
  OPEN_MERGE_PANEL: z.object({}).strict(),
  CHECKOUT_BRANCH: z.object({ name: z.string() }),
  REJECT_AI_DRAFT: z.object({ id: z.string() }),
  // stash
  GET_STASH_LIST: z.object({}).strict(),
  STASH_SAVE: z.object({ message: z.string().optional() }),
  STASH_APPLY: z.object({ ref: z.string().optional() }),
  STASH_POP: z.object({ ref: z.string().optional() }),
  STASH_DROP: z.object({ ref: z.string().optional() }),
  // unstage
  GIT_UNSTAGE: z.object({ filePaths: z.array(z.string().min(1)).min(1) }),
  // merge control
  MERGE_ABORT: z.object({}).strict(),
  MERGE_CONTINUE: z.object({}).strict(),
  // 브랜치 정리
  GET_BRANCH_CLEANUP_SETTINGS: z.object({}).strict(),
  SAVE_BRANCH_CLEANUP_SETTINGS: z.object({ settings: BranchCleanupSettingsSchema }),
  GET_BRANCH_CLEANUP_CANDIDATES: z.object({}).strict(),
  EXECUTE_BRANCH_CLEANUP: z.object({ branchNames: z.array(z.string()) }),
  // PR 관련 — 프론트가 Create Pull Request 버튼 클릭 시 전달하는 DTO
  CREATE_PR: z.object({
    title: z.string().min(1),
    description: z.string(),
    base: z.string().min(1),              // 병합 대상 base 브랜치
    headBranch: z.string().min(1),         // 현재 작업 브랜치 (head)
    reviewers: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional(),
    milestone: z.number().int().optional(), // GitHub milestone 번호
  }),
  OPEN_PR_PANEL: z.object({}).strict(),
} as const;

/**
 * Extension -> Webview 방향 payload 검증 스키마 맵입니다.
 *
 * UI로 내보내는 데이터도 동일하게 런타임 검증 가능하도록 유지해
 * 라우터/서비스 경계에서 계약 위반을 조기에 발견합니다.
 */
export const OutboundPayloadSchemaMap = {
  GIT_STATUS_UPDATED: z.object({ status: GitStatusSchema }),
  GIT_STATUS_SUMMARY: z.object({ summary: GitStatusSummarySchema }),
  SNAPSHOT_LIST: z.object({ snapshots: z.array(SnapshotSchema) }),
  SNAPSHOT_CREATED: z.object({ snapshot: SnapshotSchema }),
  RESTORE_DONE: z.object({ snapshotId: z.string() }),
  CONFLICT_RESULT: z.object({ candidates: z.array(ConflictAnalysisSchema) }),
  MERGE_PROPOSAL: z.object({ proposals: z.array(AIDraftSchema) }),
  MERGE_COMPLETE: z.object({}),
  COMMIT_SUGGESTIONS: z.object({ suggestions: CommitSuggestionSchema }),
  BRANCH_SUGGESTIONS: BranchSuggestionSchema,
  PR_SUGGESTION: PRSuggestionSchema,
  BRANCH_LIST: z.object({ branches: z.array(BranchSchema) }),
  WORKTREE_LIST: z.object({ worktrees: z.array(WorktreeInfoSchema) }),
  WORKSPACE_TREE: z.object({ tree: WorkspaceTreeSchema }),
  GIT_OPERATION_RESULT: z.object({ operation: z.string(), result: GitResultSchema }),
  ERROR: z.object({ code: ErrorCodeEnum, message: z.string() }),
  LOADING: z.object({ target: z.string(), loading: z.boolean() }),
  NOTIFICATION: z.object({ type: z.enum(['info', 'warning', 'error']), message: z.string() }),
  // stash 목록 응답
  STASH_LIST: z.object({
    stashes: z.array(z.object({
      index: z.number(),
      ref: z.string(),
      message: z.string(),
      branch: z.string(),
      date: z.string(),
    })),
  }),
  // 브랜치 정리 응답
  BRANCH_CLEANUP_SETTINGS: z.object({ settings: BranchCleanupSettingsSchema }),
  BRANCH_CLEANUP_CANDIDATES: z.object({ result: BranchCleanupPreviewResultSchema }),
  BRANCH_CLEANUP_RESULT: z.object({ result: BranchCleanupExecuteResultSchema }),
  // GitHub PR 생성 성공 응답
  PR_CREATED: z.object({
    prNumber: z.number().int(),    // GitHub PR 번호
    htmlUrl: z.string().url(),      // GitHub PR 페이지 URL
    title: z.string(),              // PR 제목
    base: z.string(),               // base 브랜치
    head: z.string(),               // head 브랜치
  }),
} as const;

/**
 * 메시지 type별 payload 타입 매핑입니다.
 *
 * 결과 예시:
 * - RECOMMEND_COMMIT -> { diffText: string; tag?: string }
 * - RECOMMEND_PR -> { base: string }
 */
export type InboundPayloadByType = {
  [K in keyof typeof InboundPayloadSchemaMap]: z.infer<(typeof InboundPayloadSchemaMap)[K]>;
};

export type OutboundPayloadByType = {
  [K in keyof typeof OutboundPayloadSchemaMap]: z.infer<(typeof OutboundPayloadSchemaMap)[K]>;
};

/**
 * Inbound 메시지 판별 유니온(discriminated union)입니다.
 *
 * `type` 값으로 분기하여 payload 스키마를 자동으로 좁히므로,
 * 라우터에서 switch(type) 시 타입 안정성이 크게 올라갑니다.
 */
const inboundMessageSchemas = InboundMessageTypeEnum.options.map((type) =>
  z.object({
    type: z.literal(type),
    payload: InboundPayloadSchemaMap[type],
    requestId: z.string().optional(),
  }),
);

export const InboundMessageSchema = z.discriminatedUnion(
  'type',
  inboundMessageSchemas as any,
);

/**
 * Outbound 메시지 판별 유니온입니다.
 *
 * Extension이 Webview로 보내는 응답/이벤트도
 * type별 payload 모양을 컴파일/런타임 양쪽에서 일치시키기 위해 사용합니다.
 */
const outboundMessageSchemas = OutboundMessageTypeEnum.options.map((type) =>
  z.object({
    type: z.literal(type),
    payload: OutboundPayloadSchemaMap[type],
    requestId: z.string().optional(),
  }),
);

export const OutboundMessageSchema = z.discriminatedUnion(
  'type',
  outboundMessageSchemas as any,
);
