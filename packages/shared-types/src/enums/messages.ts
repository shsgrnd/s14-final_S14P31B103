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
]);
export type OutboundMessageType = z.infer<typeof OutboundMessageTypeEnum>;
