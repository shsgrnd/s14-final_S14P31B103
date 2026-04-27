import { z } from 'zod';
import {
  MergeAnalysisStatusEnum,
  ProposalStatusEnum,
  QualityTagEnum,
  RecommendationTypeEnum,
  SelectionStatusEnum,
} from '../enums/ai';

/**
 * recommendation_histories 테이블의 row 스키마입니다.
 *
 * 주의:
 * - `alternative_texts_json`, `warnings_json`는 DB 저장 포맷에 맞춘 JSON 문자열 컬럼입니다.
 * - 애플리케이션 도메인 객체 변환은 repository/service 계층에서 수행합니다.
 */
export const RecommendationHistoryRowSchema = z.object({
  recommendation_id: z.string(),
  project_id: z.string(),
  session_id: z.string().nullable(),
  ai_request_id: z.string().nullable(),
  recommendation_type: RecommendationTypeEnum,
  input_summary: z.string().nullable(),
  result_text: z.string(),
  alternative_texts_json: z.string().nullable(),
  generation_basis_summary: z.string().nullable(),
  followup_notes: z.string().nullable(),
  warnings_json: z.string().nullable(),
  created_at: z.string(),
});

/**
 * proposal_feedbacks 테이블의 row 스키마입니다.
 *
 * 사용자 수락/수정/거절 결과를 저장하며,
 * 이후 AI 병합 제안 품질 개선을 위한 참고 이력으로 사용됩니다.
 */
export const ProposalFeedbackRowSchema = z.object({
  feedback_id: z.string(),
  proposal_id: z.string(),
  project_id: z.string(),
  merge_proposal_id: z.string().nullable(),
  selection_status: SelectionStatusEnum,
  final_text: z.string().nullable(),
  final_code_ref: z.string().nullable(),
  final_explanation: z.string().nullable(),
  quality_tag: QualityTagEnum.nullable(),
  feedback_note: z.string().nullable(),
  decided_at: z.string(),
});

/**
 * merge_analyses 테이블의 row 스키마입니다.
 *
 * 큰 본문 데이터는 파일 시스템에 저장하고,
 * DB에는 artifact path(참조 경로)만 유지한다는 설계 원칙을 반영합니다.
 */
export const MergeAnalysisRowSchema = z.object({
  analysis_id: z.string(),
  source_worktree_instance_id: z.string(),
  target_worktree_instance_id: z.string(),
  merge_base: z.string().nullable(),
  status: MergeAnalysisStatusEnum,
  analysis_artifact_path: z.string().nullable(),
  proposals_artifact_path: z.string().nullable(),
  created_at: z.string(),
});

/**
 * conflict_candidates 테이블의 row 스키마입니다.
 *
 * 후보 위치/신뢰도 같은 메타만 저장하며,
 * 실제 코드 조각 원문은 DB가 아닌 로컬 산출물 파일에 둡니다.
 */
export const ConflictCandidateRowSchema = z.object({
  candidate_id: z.string(),
  analysis_id: z.string(),
  file_path: z.string(),
  line_start: z.number().int().nullable(),
  line_end: z.number().int().nullable(),
  detected_by: z.string(),
  confidence_score: z.number().min(0).max(1).nullable(),
  created_at: z.string(),
});

/**
 * merge_proposals 테이블의 row 스키마입니다.
 *
 * 제안 본문 전체 대신 제목/요약/검증정보/상태만 저장해
 * 조회 성능과 스키마 단순성을 유지합니다.
 */
export const MergeProposalRowSchema = z.object({
  proposal_id: z.string(),
  candidate_id: z.string(),
  ai_request_id: z.string().nullable(),
  file_path: z.string(),
  feature_type: z.string(),
  title: z.string(),
  explanation_summary: z.string().nullable(),
  confidence_score: z.number().min(0).max(1).nullable(),
  validation_required: z.boolean(),
  validation_summary: z.string().nullable(),
  status: ProposalStatusEnum,
  created_at: z.string(),
});
