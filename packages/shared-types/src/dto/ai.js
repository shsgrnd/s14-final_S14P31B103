"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiffResultSchema = exports.CommitSuggestionSchema = exports.ProposalFeedbackSchema = exports.RecommendationHistorySchema = exports.InferenceRunSchema = exports.RecommendationInputSchema = exports.MergeProposalInputSchema = exports.AiTaskRequestSchema = exports.MergeProposalSchema = exports.MergeAnalysisSchema = exports.ConflictCandidateSchema = exports.GitStatusSchema = exports.ChangedFileSchema = void 0;
const zod_1 = require("zod");
const ai_1 = require("../enums/ai");
// ==========================================
// 1. Git 공통 타입
// ==========================================
// ERD: changed_files 테이블 기준
exports.ChangedFileSchema = zod_1.z.object({
    file_path: zod_1.z.string(),
    change_type: ai_1.ChangeTypeEnum, // 'added' | 'modified' | 'deleted' | 'renamed'
    location: zod_1.z.string().optional(),
    summary: zod_1.z.string().optional(),
});
// 명세서(05번): getStatus() 반환 타입
exports.GitStatusSchema = zod_1.z.object({
    current: zod_1.z.string(),
    staged: zod_1.z.array(zod_1.z.string()),
    unstaged: zod_1.z.array(zod_1.z.string()),
    untracked: zod_1.z.array(zod_1.z.string()),
    conflicted: zod_1.z.array(zod_1.z.string()),
});
// ==========================================
// 2. 충돌 후보 (conflict_candidates 테이블)
// ==========================================
// ERD에 맞춰 line_range 중첩 객체 → line_start, line_end 플랫 필드로 변경
exports.ConflictCandidateSchema = zod_1.z.object({
    candidate_id: zod_1.z.string(),
    analysis_id: zod_1.z.string(),
    file_path: zod_1.z.string(),
    line_start: zod_1.z.number().int(), // ERD: INT
    line_end: zod_1.z.number().int(), // ERD: INT
    source_code: zod_1.z.string(), // 로컬 FS에 저장되지만 AI 파이프라인 내부 전달용
    target_code: zod_1.z.string(),
    base_code: zod_1.z.string().optional(),
    conflict_type: zod_1.z.string().optional(),
    reason_summary: zod_1.z.string().optional(),
    risk_level: ai_1.RiskLevelEnum.optional(),
    detected_by: ai_1.DetectionMethodEnum,
});
// ==========================================
// 3. 병합 분석 (merge_analyses 테이블)
// ==========================================
exports.MergeAnalysisSchema = zod_1.z.object({
    analysis_id: zod_1.z.string(),
    session_id: zod_1.z.string(),
    source_worktree_instance_id: zod_1.z.string(),
    target_worktree_instance_id: zod_1.z.string().optional(),
    merge_base: zod_1.z.string().optional(),
    status: ai_1.MergeAnalysisStatusEnum,
    analysis_artifact_path: zod_1.z.string().optional(),
    proposal_artifact_path: zod_1.z.string().optional(),
    created_at: zod_1.z.string(),
});
// ==========================================
// 4. 병합 제안 (merge_proposals 테이블)
// ==========================================
// ERD 기준: candidate_id, ai_request_id 참조, confidence_score는 REAL
exports.MergeProposalSchema = zod_1.z.object({
    candidate_id: zod_1.z.string(), // ERD: FK → conflict_candidates
    ai_request_id: zod_1.z.string(), // ERD: FK → ai_requests (기존 analysis_id 수정)
    file_path: zod_1.z.string(),
    feature_type: ai_1.FeatureTypeEnum,
    title: zod_1.z.string().optional(),
    explanation_summary: zod_1.z.string().optional(),
    proposed_code: zod_1.z.string(), // 로컬 FS 저장용이지만 AI 파이프라인 전달용
    confidence_score: zod_1.z.number().min(0).max(1), // ERD: REAL (0.0~1.0, 기존 ConfidenceEnum 수정)
    validation_required: zod_1.z.boolean().optional(),
    validation_summary: zod_1.z.string().optional(),
    status: ai_1.MergeProposalStatusEnum,
    created_at: zod_1.z.string(),
});
// ==========================================
// 5. AI 요청 (ai_requests 테이블)
// ==========================================
exports.AiTaskRequestSchema = zod_1.z.object({
    project_id: zod_1.z.string(),
    session_id: zod_1.z.string(),
    feature_type: ai_1.FeatureTypeEnum,
    user_intent: zod_1.z.string(),
    request_origin: ai_1.RequestOriginEnum,
    trigger_source: ai_1.TriggerSourceEnum,
    response_format: ai_1.ResponseFormatEnum.optional(),
    status: ai_1.RequestStatusEnum,
    requested_at: zod_1.z.string(),
});
// ==========================================
// 6. AI 입력 Payload (ai-pipeline 내부 전달용)
// ==========================================
// 병합/충돌 설명 관련 기능 payload
exports.MergeProposalInputSchema = zod_1.z.object({
    project_id: zod_1.z.string(),
    session_id: zod_1.z.string(),
    feature_type: zod_1.z.enum(['merge_patch_draft', 'merge_mediation', 'conflict_explanation']),
    current_branch: zod_1.z.string(),
    target_branch: zod_1.z.string(),
    workspace_summary: zod_1.z.string().optional(),
    related_files: zod_1.z.array(zod_1.z.string()),
    conflict_candidates: zod_1.z.array(exports.ConflictCandidateSchema),
    working_tree_diff_ref: zod_1.z.string(),
    risk_summary: zod_1.z.string().optional(),
    schema_version: zod_1.z.string(),
});
// 추천 기능 payload
exports.RecommendationInputSchema = zod_1.z.object({
    project_id: zod_1.z.string(),
    session_id: zod_1.z.string(),
    feature_type: zod_1.z.literal('recommendation'),
    recommendation_type: ai_1.RecommendationTypeEnum,
    current_branch: zod_1.z.string(),
    workspace_summary: zod_1.z.string().optional(),
    change_summary: zod_1.z.string(),
    changed_files: zod_1.z.array(zod_1.z.string()),
    work_intent: zod_1.z.string(),
    diff_summary: zod_1.z.string().optional(),
    branch_context: zod_1.z.string().optional(),
    ticket_ref: zod_1.z.string().optional(),
    naming_constraints: zod_1.z.array(zod_1.z.string()).optional(),
    message_constraints: zod_1.z.array(zod_1.z.string()).optional(),
    schema_version: zod_1.z.string(),
});
// ==========================================
// 7. 추론 실행 (inference_runs 테이블)
// ==========================================
exports.InferenceRunSchema = zod_1.z.object({
    inference_run_id: zod_1.z.string(),
    session_id: zod_1.z.string(),
    ai_request_id: zod_1.z.string().optional(),
    parent_inference_run_id: zod_1.z.string().optional(),
    run_type: ai_1.InferenceRunTypeEnum,
    input_summary: zod_1.z.string().optional(),
    status: ai_1.InferenceRunStatusEnum,
    response_ref: zod_1.z.string().optional(),
    created_at: zod_1.z.string(),
});
// ==========================================
// 8. 추천 결과 (recommendation_histories 테이블)
// ==========================================
exports.RecommendationHistorySchema = zod_1.z.object({
    recommendation_id: zod_1.z.string(),
    ai_request_id: zod_1.z.string(),
    recommendation_type: ai_1.RecommendationTypeEnum,
    result_summary: zod_1.z.string().optional(),
    result_text: zod_1.z.string().optional(),
    response_ref: zod_1.z.string().optional(),
    created_at: zod_1.z.string(),
});
// ==========================================
// 9. 사용자 피드백 (proposal_feedbacks 테이블)
// ==========================================
exports.ProposalFeedbackSchema = zod_1.z.object({
    feedback_id: zod_1.z.string(),
    merge_proposal_id: zod_1.z.string().optional(),
    session_id: zod_1.z.string(),
    selection_status: ai_1.SelectionStatusEnum,
    input_summary: zod_1.z.string().optional(),
    response_ref: zod_1.z.string().optional(),
    feedback_note: zod_1.z.string().optional(),
    quality_tag: ai_1.QualityTagEnum.optional(),
    decided_at: zod_1.z.string(),
});
// ==========================================
// 10. 커밋 추천 결과 (AI pipeline 내부)
// ==========================================
exports.CommitSuggestionSchema = zod_1.z.object({
    messages: zod_1.z.array(zod_1.z.string()),
    branch_names: zod_1.z.array(zod_1.z.string()),
    description: zod_1.z.string(),
});
// ==========================================
// 12. Diff 결과 (DiffResult)
// ==========================================
exports.DiffResultSchema = zod_1.z.object({
    file_path: zod_1.z.string(),
    hunks: zod_1.z.array(zod_1.z.string()),
});
//# sourceMappingURL=ai.js.map