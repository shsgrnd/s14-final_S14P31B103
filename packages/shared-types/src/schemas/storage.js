"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MergeProposalRowSchema = exports.ConflictCandidateRowSchema = exports.MergeAnalysisRowSchema = exports.ProposalFeedbackRowSchema = exports.RecommendationHistoryRowSchema = void 0;
const zod_1 = require("zod");
const ai_1 = require("../enums/ai");
/**
 * recommendation_histories 테이블의 row 스키마입니다.
 *
 * 주의:
 * - `alternative_texts_json`, `warnings_json`는 DB 저장 포맷에 맞춘 JSON 문자열 컬럼입니다.
 * - 애플리케이션 도메인 객체 변환은 repository/service 계층에서 수행합니다.
 */
exports.RecommendationHistoryRowSchema = zod_1.z.object({
    recommendation_id: zod_1.z.string(),
    project_id: zod_1.z.string(),
    session_id: zod_1.z.string().nullable(),
    ai_request_id: zod_1.z.string().nullable(),
    recommendation_type: ai_1.RecommendationTypeEnum,
    input_summary: zod_1.z.string().nullable(),
    result_text: zod_1.z.string(),
    alternative_texts_json: zod_1.z.string().nullable(),
    generation_basis_summary: zod_1.z.string().nullable(),
    followup_notes: zod_1.z.string().nullable(),
    warnings_json: zod_1.z.string().nullable(),
    created_at: zod_1.z.string(),
});
/**
 * proposal_feedbacks 테이블의 row 스키마입니다.
 *
 * 사용자 수락/수정/거절 결과를 저장하며,
 * 이후 AI 병합 제안 품질 개선을 위한 참고 이력으로 사용됩니다.
 */
exports.ProposalFeedbackRowSchema = zod_1.z.object({
    feedback_id: zod_1.z.string(),
    proposal_id: zod_1.z.string(),
    project_id: zod_1.z.string(),
    merge_proposal_id: zod_1.z.string().nullable(),
    selection_status: ai_1.SelectionStatusEnum,
    final_text: zod_1.z.string().nullable(),
    final_code_ref: zod_1.z.string().nullable(),
    final_explanation: zod_1.z.string().nullable(),
    quality_tag: ai_1.QualityTagEnum.nullable(),
    feedback_note: zod_1.z.string().nullable(),
    decided_at: zod_1.z.string(),
});
/**
 * merge_analyses 테이블의 row 스키마입니다.
 *
 * 큰 본문 데이터는 파일 시스템에 저장하고,
 * DB에는 artifact path(참조 경로)만 유지한다는 설계 원칙을 반영합니다.
 */
exports.MergeAnalysisRowSchema = zod_1.z.object({
    analysis_id: zod_1.z.string(),
    source_worktree_instance_id: zod_1.z.string(),
    target_worktree_instance_id: zod_1.z.string(),
    merge_base: zod_1.z.string().nullable(),
    status: ai_1.MergeAnalysisStatusEnum,
    analysis_artifact_path: zod_1.z.string().nullable(),
    proposals_artifact_path: zod_1.z.string().nullable(),
    created_at: zod_1.z.string(),
});
/**
 * conflict_candidates 테이블의 row 스키마입니다.
 *
 * 후보 위치/신뢰도 같은 메타만 저장하며,
 * 실제 코드 조각 원문은 DB가 아닌 로컬 산출물 파일에 둡니다.
 */
exports.ConflictCandidateRowSchema = zod_1.z.object({
    candidate_id: zod_1.z.string(),
    analysis_id: zod_1.z.string(),
    file_path: zod_1.z.string(),
    line_start: zod_1.z.number().int().nullable(),
    line_end: zod_1.z.number().int().nullable(),
    detected_by: zod_1.z.string(),
    confidence_score: zod_1.z.number().min(0).max(1).nullable(),
    created_at: zod_1.z.string(),
});
/**
 * merge_proposals 테이블의 row 스키마입니다.
 *
 * 제안 본문 전체 대신 제목/요약/검증정보/상태만 저장해
 * 조회 성능과 스키마 단순성을 유지합니다.
 */
exports.MergeProposalRowSchema = zod_1.z.object({
    proposal_id: zod_1.z.string(),
    candidate_id: zod_1.z.string(),
    ai_request_id: zod_1.z.string().nullable(),
    file_path: zod_1.z.string(),
    feature_type: zod_1.z.string(),
    title: zod_1.z.string(),
    explanation_summary: zod_1.z.string().nullable(),
    confidence_score: zod_1.z.number().min(0).max(1).nullable(),
    validation_required: zod_1.z.boolean(),
    validation_summary: zod_1.z.string().nullable(),
    status: ai_1.ProposalStatusEnum,
    created_at: zod_1.z.string(),
});
//# sourceMappingURL=storage.js.map