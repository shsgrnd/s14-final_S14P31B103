import type {
  ConflictCandidateRow,
  MergeAnalysisRow,
  MergeProposalRow,
  ProposalFeedbackRow,
  RecommendationHistoryRow,
} from '../dto/storage';
import type { InboundMessage, OutboundMessage } from '../dto/messages';

/**
 * recommendation_histories 생성 입력 DTO입니다.
 *
 * 호출자는 "의미 데이터"만 넘기고,
 * row id/timestamp/json 직렬화 같은 저장소 세부사항은 구현체가 책임지도록 분리합니다.
 */
export interface CreateRecommendationHistoryInput {
  project_id: string;
  session_id?: string | null;
  ai_request_id?: string | null;
  recommendation_type: RecommendationHistoryRow['recommendation_type'];
  input_summary?: string | null;
  result_text: string;
  alternative_texts?: string[];
  generation_basis_summary?: string | null;
  followup_notes?: string | null;
  warnings?: string[];
}

/**
 * proposal_feedbacks 생성 입력 DTO입니다.
 *
 * 병합안 수락/수정/거절 시점에 메시지 핸들러/서비스가 이 타입으로 저장 요청합니다.
 */
export interface CreateProposalFeedbackInput {
  proposal_id: string;
  project_id: string;
  merge_proposal_id?: string | null;
  selection_status: ProposalFeedbackRow['selection_status'];
  final_text?: string | null;
  final_code_ref?: string | null;
  final_explanation?: string | null;
  quality_tag?: ProposalFeedbackRow['quality_tag'];
  feedback_note?: string | null;
}

/**
 * 추천 이력 저장소 계약입니다.
 *
 * 백엔드1/2 구현체가 달라도(예: SQLite 직접, ORM 래퍼) 동일한 호출 계약을 유지합니다.
 */
export interface RecommendationHistoryRepository {
  insert(input: CreateRecommendationHistoryInput): Promise<RecommendationHistoryRow>;
  listByProject(projectId: string, limit?: number): Promise<RecommendationHistoryRow[]>;
  listRecentByType(
    projectId: string,
    type: RecommendationHistoryRow['recommendation_type'],
    limit?: number,
  ): Promise<RecommendationHistoryRow[]>;
}

/**
 * 병합 제안 피드백 저장소 계약입니다.
 */
export interface ProposalFeedbackRepository {
  insert(input: CreateProposalFeedbackInput): Promise<ProposalFeedbackRow>;
  listByProject(projectId: string, limit?: number): Promise<ProposalFeedbackRow[]>;
  listByProposal(proposalId: string): Promise<ProposalFeedbackRow[]>;
}

/**
 * merge_analyses 메타데이터 저장소 계약입니다.
 */
export interface MergeAnalysisRepository {
  insert(meta: Omit<MergeAnalysisRow, 'created_at'> & { created_at?: string }): Promise<MergeAnalysisRow>;
  findById(analysisId: string): Promise<MergeAnalysisRow | null>;
  updateStatus(analysisId: string, status: MergeAnalysisRow['status']): Promise<void>;
  attachArtifactPaths(
    analysisId: string,
    artifacts: { analysis_artifact_path?: string | null; proposals_artifact_path?: string | null },
  ): Promise<void>;
}

/**
 * conflict_candidates 저장소 계약입니다.
 */
export interface ConflictCandidateRepository {
  insertMany(candidates: Array<Omit<ConflictCandidateRow, 'created_at'> & { created_at?: string }>): Promise<void>;
  listByAnalysis(analysisId: string): Promise<ConflictCandidateRow[]>;
}

/**
 * merge_proposals 저장소 계약입니다.
 */
export interface MergeProposalRepository {
  insertMany(proposals: Array<Omit<MergeProposalRow, 'created_at'> & { created_at?: string }>): Promise<void>;
  listByAnalysis(analysisId: string): Promise<MergeProposalRow[]>;
  updateStatus(proposalId: string, status: MergeProposalRow['status']): Promise<void>;
}

/**
 * 메시지 검증기 계약입니다.
 *
 * 라우터는 구현체를 몰라도 parseInbound/parseOutbound만 호출하면
 * 계약 위반 메시지를 런타임에서 안전하게 걸러낼 수 있습니다.
 */
export interface MessageValidator {
  parseInbound(message: unknown): InboundMessage;
  parseOutbound(message: unknown): OutboundMessage;
}
