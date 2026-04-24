import { z } from 'zod';
import { ErrorCodeEnum } from '../enums/ai';
import { InboundMessageTypeEnum, OutboundMessageTypeEnum } from '../enums/messages';
import {
  CommitSuggestionSchema,
  ConflictCandidateSchema,
  MergeProposalSchema,
} from '../dto/ai';

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
  DELETE_SNAPSHOT: z.object({ snapshotId: z.string() }),
  SET_CHECKPOINT: z.object({ snapshotId: z.string() }),
  REFRESH_STATUS: z.object({}).strict(),
  GET_SNAPSHOT_LIST: z.object({}).strict(),
  GET_BRANCH_LIST: z.object({}).strict(),
} as const;

/**
 * Extension -> Webview 방향 payload 검증 스키마 맵입니다.
 *
 * UI로 내보내는 데이터도 동일하게 런타임 검증 가능하도록 유지해
 * 라우터/서비스 경계에서 계약 위반을 조기에 발견합니다.
 */
export const OutboundPayloadSchemaMap = {
  GIT_STATUS_UPDATED: z.object({ status: z.unknown() }),
  SNAPSHOT_LIST: z.object({ snapshots: z.array(z.unknown()) }),
  SNAPSHOT_CREATED: z.object({ snapshot: z.unknown() }),
  RESTORE_DONE: z.object({ snapshotId: z.string() }),
  CONFLICT_RESULT: z.object({ candidates: z.array(ConflictCandidateSchema) }),
  MERGE_PROPOSAL: z.object({ proposals: z.array(MergeProposalSchema) }),
  MERGE_COMPLETE: z.object({}),
  COMMIT_SUGGESTIONS: z.object({ suggestions: CommitSuggestionSchema }),
  BRANCH_SUGGESTIONS: z.object({ names: z.array(z.string()) }),
  PR_SUGGESTION: z.object({ markdown: z.string() }),
  BRANCH_LIST: z.object({ branches: z.array(z.unknown()) }),
  ERROR: z.object({ code: ErrorCodeEnum, message: z.string() }),
  LOADING: z.object({ target: z.string(), loading: z.boolean() }),
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
export const InboundMessageSchema = z.discriminatedUnion(
  'type',
  InboundMessageTypeEnum.options.map((type) =>
    z.object({
      type: z.literal(type),
      payload: InboundPayloadSchemaMap[type],
      requestId: z.string().optional(),
    }),
  ) as [z.ZodTypeAny, ...z.ZodTypeAny[]],
);

/**
 * Outbound 메시지 판별 유니온입니다.
 *
 * Extension이 Webview로 보내는 응답/이벤트도
 * type별 payload 모양을 컴파일/런타임 양쪽에서 일치시키기 위해 사용합니다.
 */
export const OutboundMessageSchema = z.discriminatedUnion(
  'type',
  OutboundMessageTypeEnum.options.map((type) =>
    z.object({
      type: z.literal(type),
      payload: OutboundPayloadSchemaMap[type],
      requestId: z.string().optional(),
    }),
  ) as [z.ZodTypeAny, ...z.ZodTypeAny[]],
);
