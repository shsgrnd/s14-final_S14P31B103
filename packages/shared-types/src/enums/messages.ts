import { z } from 'zod';

/**
 * Webview -> Extension Host 방향으로 들어오는 메시지 type 집합입니다.
 *
 * 이 enum은 라우터 분기 기준으로 사용되며,
 * docs/planning/reference/02_message_protocol.csv의 Inbound 명세와 1:1로 맞춰야 합니다.
 */
export const InboundMessageTypeEnum = z.enum([
  'RESTORE_SNAPSHOT',
  'ANALYZE_CONFLICT',
  'ACCEPT_MERGE',
  'REJECT_MERGE',
  'RUN_MERGE',
  'RECOMMEND_COMMIT',
  'RECOMMEND_BRANCH',
  'RECOMMEND_PR',
  'APPLY_COMMIT',
  'APPLY_BRANCH',
  'DELETE_BRANCHES',
  'GIT_STAGE_FILES',
  'GIT_UNSTAGE_FILES',
  'GIT_DISCARD_CHANGES',
  'GIT_STASH_SAVE',
  'GIT_STASH_POP',
  'GIT_STASH_APPLY',
  'GIT_STASH_DROP',
  'GIT_MERGE_ABORT',
  'GIT_MERGE_CONTINUE',
  'DELETE_SNAPSHOT',
  'SET_CHECKPOINT',
  'REFRESH_STATUS',
  'GET_GIT_STATUS_SUMMARY',
  'GET_SNAPSHOT_LIST',
  'GET_BRANCH_LIST',
  'GET_WORKTREE_LIST',
  'GET_WORKSPACE_TREE',
  // 추가된 메시지 타입
  'CREATE_SNAPSHOT',
  'RENAME_SNAPSHOT',
  'TOGGLE_SNAPSHOT_STAR',
  'GET_SNAPSHOT_FILES',
  'OPEN_FILE_DIFF',
  'OPEN_WORKSPACE_FILE',
  'EXECUTE_PULL',
  'OPEN_DIFF_EDITOR',
  'SET_CONFIG',
  'GET_AI_DRAFT',
  'EXECUTE_COMMIT',
  'GIT_ADD_ALL',
  'GIT_PUSH',
  'OPEN_MERGE_PANEL',
  'CHECKOUT_BRANCH',
  'REJECT_AI_DRAFT',
  // stash 작업
  'GET_STASH_LIST',
  'STASH_SAVE',
  'STASH_APPLY',
  'STASH_POP',
  'STASH_DROP',
  // unstage 작업
  'GIT_UNSTAGE',
  // merge abort / continue
  'MERGE_ABORT',
  'MERGE_CONTINUE',
  // 브랜치 정리 (Branch Cleanup)
  'GET_BRANCH_CLEANUP_SETTINGS',
  'SAVE_BRANCH_CLEANUP_SETTINGS',
  'GET_BRANCH_CLEANUP_CANDIDATES',
  'EXECUTE_BRANCH_CLEANUP',
  // PR 관련
  'GET_PR_TEMPLATES',
  'CREATE_PR',
  'OPEN_PR_PANEL',
]);
export type InboundMessageType = z.infer<typeof InboundMessageTypeEnum>;

/**
 * Extension Host -> Webview 방향으로 나가는 메시지 type 집합입니다.
 *
 * 이 enum은 UI 상태 갱신, 응답 처리, 에러 표시의 계약 키로 사용되므로
 * 임의 변경 시 프론트 수신 로직과 반드시 함께 수정되어야 합니다.
 */
export const OutboundMessageTypeEnum = z.enum([
  'GIT_STATUS_UPDATED',
  'GIT_STATUS_SUMMARY',
  'SNAPSHOT_LIST',
  'SNAPSHOT_CREATED',
  'RESTORE_DONE',
  'CONFLICT_RESULT',
  'MERGE_PROPOSAL',
  'MERGE_COMPLETE',
  'COMMIT_SUGGESTIONS',
  'BRANCH_SUGGESTIONS',
  'PR_SUGGESTION',
  'BRANCH_LIST',
  'WORKTREE_LIST',
  'WORKSPACE_TREE',
  'GIT_OPERATION_RESULT',
  'ERROR',
  'LOADING',
  'NOTIFICATION',
  // stash 목록 응답
  'STASH_LIST',
  // 브랜치 정리 (Branch Cleanup) 응답
  'BRANCH_CLEANUP_SETTINGS',
  'BRANCH_CLEANUP_CANDIDATES',
  'BRANCH_CLEANUP_RESULT',
  // GitHub PR 생성 성공 응답
  'PR_TEMPLATES',
  'PR_CREATED',
]);
export type OutboundMessageType = z.infer<typeof OutboundMessageTypeEnum>;
