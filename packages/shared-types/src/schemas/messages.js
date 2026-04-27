"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboundMessageSchema = exports.InboundMessageSchema = exports.OutboundPayloadSchemaMap = exports.InboundPayloadSchemaMap = exports.EnvelopeSchema = void 0;
const zod_1 = require("zod");
const ai_1 = require("../enums/ai");
const messages_1 = require("../enums/messages");
const ai_2 = require("../dto/ai");
/**
 * 메시지 공통 봉투(envelope) 구조입니다.
 *
 * 실제 type별 상세 검증 전에 최소한의 공통 필드 존재 여부를 확인하거나,
 * 라우터 로깅/트레이싱에서 requestId를 추적할 때 사용합니다.
 */
exports.EnvelopeSchema = zod_1.z.object({
    type: zod_1.z.string(),
    payload: zod_1.z.unknown().optional(),
    requestId: zod_1.z.string().optional(),
});
/**
 * Webview -> Extension 방향 payload 검증 스키마 맵입니다.
 *
 * 키는 메시지 type, 값은 해당 type에서 허용되는 payload 스키마입니다.
 * `as const`를 사용해 키 리터럴 타입을 고정해야
 * 이후 mapped type에서 type별 payload 추론이 정확히 동작합니다.
 */
exports.InboundPayloadSchemaMap = {
    RESTORE_SNAPSHOT: zod_1.z.object({ snapshotId: zod_1.z.string() }),
    ANALYZE_CONFLICT: zod_1.z.object({ source: zod_1.z.string(), target: zod_1.z.string() }),
    ACCEPT_MERGE: zod_1.z.object({ filePath: zod_1.z.string(), code: zod_1.z.string() }),
    REJECT_MERGE: zod_1.z.object({ filePath: zod_1.z.string() }),
    RUN_MERGE: zod_1.z.object({ source: zod_1.z.string(), target: zod_1.z.string() }),
    RECOMMEND_COMMIT: zod_1.z.object({ diffText: zod_1.z.string().min(1), tag: zod_1.z.string().optional() }),
    RECOMMEND_BRANCH: zod_1.z.object({ purpose: zod_1.z.string().min(1) }),
    RECOMMEND_PR: zod_1.z.object({ base: zod_1.z.string().min(1) }),
    APPLY_COMMIT: zod_1.z.object({ message: zod_1.z.string().min(1), body: zod_1.z.string().optional() }),
    APPLY_BRANCH: zod_1.z.object({ name: zod_1.z.string().min(1) }),
    DELETE_BRANCHES: zod_1.z.object({ names: zod_1.z.array(zod_1.z.string().min(1)).min(1), force: zod_1.z.boolean() }),
    DELETE_SNAPSHOT: zod_1.z.object({ snapshotId: zod_1.z.string() }),
    SET_CHECKPOINT: zod_1.z.object({ snapshotId: zod_1.z.string() }),
    REFRESH_STATUS: zod_1.z.object({}).strict(),
    GET_SNAPSHOT_LIST: zod_1.z.object({}).strict(),
    GET_BRANCH_LIST: zod_1.z.object({}).strict(),
};
/**
 * Extension -> Webview 방향 payload 검증 스키마 맵입니다.
 *
 * UI로 내보내는 데이터도 동일하게 런타임 검증 가능하도록 유지해
 * 라우터/서비스 경계에서 계약 위반을 조기에 발견합니다.
 */
exports.OutboundPayloadSchemaMap = {
    GIT_STATUS_UPDATED: zod_1.z.object({ status: zod_1.z.unknown() }),
    SNAPSHOT_LIST: zod_1.z.object({ snapshots: zod_1.z.array(zod_1.z.unknown()) }),
    SNAPSHOT_CREATED: zod_1.z.object({ snapshot: zod_1.z.unknown() }),
    RESTORE_DONE: zod_1.z.object({ snapshotId: zod_1.z.string() }),
    CONFLICT_RESULT: zod_1.z.object({ candidates: zod_1.z.array(ai_2.ConflictCandidateSchema) }),
    MERGE_PROPOSAL: zod_1.z.object({ proposals: zod_1.z.array(ai_2.MergeProposalSchema) }),
    MERGE_COMPLETE: zod_1.z.object({}),
    COMMIT_SUGGESTIONS: zod_1.z.object({ suggestions: ai_2.CommitSuggestionSchema }),
    BRANCH_SUGGESTIONS: zod_1.z.object({ names: zod_1.z.array(zod_1.z.string()) }),
    PR_SUGGESTION: zod_1.z.object({ markdown: zod_1.z.string() }),
    BRANCH_LIST: zod_1.z.object({ branches: zod_1.z.array(zod_1.z.unknown()) }),
    ERROR: zod_1.z.object({ code: ai_1.ErrorCodeEnum, message: zod_1.z.string() }),
    LOADING: zod_1.z.object({ target: zod_1.z.string(), loading: zod_1.z.boolean() }),
};
/**
 * Inbound 메시지 판별 유니온(discriminated union)입니다.
 *
 * `type` 값으로 분기하여 payload 스키마를 자동으로 좁히므로,
 * 라우터에서 switch(type) 시 타입 안정성이 크게 올라갑니다.
 */
const inboundMessageSchemas = messages_1.InboundMessageTypeEnum.options.map((type) => zod_1.z.object({
    type: zod_1.z.literal(type),
    payload: exports.InboundPayloadSchemaMap[type],
    requestId: zod_1.z.string().optional(),
}));
exports.InboundMessageSchema = zod_1.z.discriminatedUnion('type', inboundMessageSchemas);
/**
 * Outbound 메시지 판별 유니온입니다.
 *
 * Extension이 Webview로 보내는 응답/이벤트도
 * type별 payload 모양을 컴파일/런타임 양쪽에서 일치시키기 위해 사용합니다.
 */
const outboundMessageSchemas = messages_1.OutboundMessageTypeEnum.options.map((type) => zod_1.z.object({
    type: zod_1.z.literal(type),
    payload: exports.OutboundPayloadSchemaMap[type],
    requestId: zod_1.z.string().optional(),
}));
exports.OutboundMessageSchema = zod_1.z.discriminatedUnion('type', outboundMessageSchemas);
//# sourceMappingURL=messages.js.map