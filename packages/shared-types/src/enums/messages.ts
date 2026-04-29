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
  'DELETE_SNAPSHOT',
  'SET_CHECKPOINT',
  'REFRESH_STATUS',
  'GET_SNAPSHOT_LIST',
  'GET_BRANCH_LIST',
  // 추가된 메시지 타입
  'CREATE_SNAPSHOT',
  'RENAME_SNAPSHOT',
  'TOGGLE_SNAPSHOT_STAR',
  'GET_SNAPSHOT_FILES',
  'OPEN_FILE_DIFF',
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
  // 1단계 추가: stash 작업 (Backend 1 추가 — Backend 2 확인 필요)
  'GET_STASH_LIST',
  'STASH_SAVE',
  'STASH_APPLY',
  'STASH_POP',
  'STASH_DROP',
  // 1단계 추가: unstage 작업
  'GIT_UNSTAGE',
  // 1단계 추가: merge abort / continue
  'MERGE_ABORT',
  'MERGE_CONTINUE',
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
  'ERROR',
  'LOADING',
  'NOTIFICATION',
  // 1단계 추가: stash 목록 응답 (Backend 1 추가 — Backend 2 확인 필요)
  'STASH_LIST',
]);
export type OutboundMessageType = z.infer<typeof OutboundMessageTypeEnum>;
