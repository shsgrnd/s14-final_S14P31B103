import type {
  BranchRow,
  ChangeRecordRow,
  ChangedFileRow,
  ConflictCandidateRow,
  MergeAnalysisRow,
  MergeProposalRow,
  ProjectRow,
  ProjectWorkspaceRow,
  ProposalFeedbackRow,
  RecommendationHistoryRow,
  RestoreHistoryRow,
  SnapshotFileRow,
  SnapshotRow,
  WorkSessionRow,
  WorktreeRow,
  WorktreeInstanceRow,
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
  feedback_id?: string;
  proposal_id: string;
  project_id: string;
  merge_proposal_id?: string | null;
  selection_status: ProposalFeedbackRow['selection_status'];
  final_text?: string | null;
  final_code_ref?: string | null;
  final_explanation?: string | null;
  quality_tag?: ProposalFeedbackRow['quality_tag'];
  feedback_note?: string | null;
  decided_at?: string;
}

/**
 * 추천 이력 저장소 계약입니다.
 *
 * 백엔드1/2 구현체가 달라도(예: SQLite 직접, ORM 래퍼) 동일한 호출 계약을 유지합니다.
 */
export interface RecommendationHistoryRepository {
  /** 단건 추천 이력 조회. 존재하지 않으면 null 반환 */
  findById(recommendationId: string): Promise<RecommendationHistoryRow | null>;
  /** 이력 저장 */
  insert(input: CreateRecommendationHistoryInput): Promise<RecommendationHistoryRow>;
  /** 프로젝트 전체 이력 최신순 조회 */
  listByProject(projectId: string, limit?: number): Promise<RecommendationHistoryRow[]>;
  /** 추천 타입 필터 + 최신순 조회 (AI 참고 컨텍스트 수집용 핵심 메서드) */
  listRecentByType(
    projectId: string,
    type: RecommendationHistoryRow['recommendation_type'],
    limit?: number,
  ): Promise<RecommendationHistoryRow[]>;
  /**
   * 최근 N일 이내의 추천 이력을 타입 필터로 조회한다.
   *
   * 오래된 이력보다 최근 맥락이 AI 참고에 더 유의미하기 때문에
   * 날짜 범위로 추가 필터링할 수 있는 전용 메서드를 제공한다.
   *
   * @param projectId 프로젝트 ID
   * @param type 추천 유형
   * @param withinDays 오늘 기준 최근 N일 이내 (예: 7 → 최근 7일)
   * @param limit 최대 반환 건수
   */
  listRecentByTypeWithinDays(
    projectId: string,
    type: RecommendationHistoryRow['recommendation_type'],
    withinDays: number,
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

export interface CreateWorkSessionInput {
  session_id: string;
  worktree_instance_id: string;
  session_type: WorkSessionRow['session_type'];
  base_snapshot_id?: string | null;
  description?: string | null;
  status?: WorkSessionRow['status'];
  started_at?: string;
}

export interface WorkSessionRepository {
  create(input: CreateWorkSessionInput): Promise<WorkSessionRow>;
  findById(sessionId: string): Promise<WorkSessionRow | null>;
  findActive(worktreeInstanceId: string, sessionType?: WorkSessionRow['session_type']): Promise<WorkSessionRow | null>;
  complete(sessionId: string, endedAt?: string): Promise<WorkSessionRow | null>;
  updateStatus(sessionId: string, status: WorkSessionRow['status'], endedAt?: string | null): Promise<WorkSessionRow | null>;
  deleteById(sessionId: string): Promise<void>;
}

export interface CreateSnapshotInput {
  snapshot_id: string;
  session_id: string;
  type: SnapshotRow['type'];
  previous_snapshot_id?: string | null;
  reason?: string | null;
  summary?: string | null;
  local_path?: string | null;
  created_at?: string;
}

export interface SnapshotRepository {
  create(input: CreateSnapshotInput): Promise<SnapshotRow>;
  findById(snapshotId: string): Promise<SnapshotRow | null>;
  findLatestBySession(sessionId: string): Promise<SnapshotRow | null>;
  findLatestByWorktreeInstance(worktreeInstanceId: string): Promise<SnapshotRow | null>;
  listRecent(limit?: number): Promise<SnapshotRow[]>;
  listByWorkspace(worktreeInstanceId: string, limit?: number): Promise<SnapshotRow[]>;
  listAutoDeletionCandidates(worktreeInstanceId: string, keepRecent?: number, limit?: number): Promise<SnapshotRow[]>;
  deleteById(snapshotId: string): Promise<void>;
}

export type CreateSnapshotFileInput = Omit<SnapshotFileRow, 'created_at'> & {
  created_at?: string;
};

export interface SnapshotFileRepository {
  createMany(files: CreateSnapshotFileInput[]): Promise<void>;
  findById(snapshotFileId: string): Promise<SnapshotFileRow | null>;
  listBySnapshotId(snapshotId: string): Promise<SnapshotFileRow[]>;
  deleteById(snapshotFileId: string): Promise<void>;
  deleteBySnapshotId(snapshotId: string): Promise<void>;
}

export interface CreateChangeRecordInput {
  record_id: string;
  session_id: string;
  branch_name?: string | null;
  description?: string | null;
  created_at?: string;
}

export interface ChangeRecordRepository {
  create(input: CreateChangeRecordInput): Promise<ChangeRecordRow>;
  findById(recordId: string): Promise<ChangeRecordRow | null>;
  listBySession(sessionId: string, limit?: number): Promise<ChangeRecordRow[]>;
  deleteById(recordId: string): Promise<void>;
}

export type CreateChangedFileInput = Omit<ChangedFileRow, 'created_at'> & {
  created_at?: string;
};

export interface ChangedFileRepository {
  createMany(files: CreateChangedFileInput[]): Promise<void>;
  findById(changedFileId: string): Promise<ChangedFileRow | null>;
  listByRecordId(recordId: string): Promise<ChangedFileRow[]>;
  deleteById(changedFileId: string): Promise<void>;
  deleteByRecordId(recordId: string): Promise<void>;
}

export interface CreateRestoreHistoryInput {
  restore_history_id: string;
  target_snapshot_id: string;
  pre_restore_snapshot_id?: string | null;
  restored_at?: string;
}

export interface RestoreHistoryRepository {
  create(input: CreateRestoreHistoryInput): Promise<RestoreHistoryRow>;
  findById(restoreHistoryId: string): Promise<RestoreHistoryRow | null>;
  listByWorkspace(worktreeInstanceId: string, limit?: number): Promise<RestoreHistoryRow[]>;
  listBySnapshotId(snapshotId: string, limit?: number): Promise<RestoreHistoryRow[]>;
  deleteById(restoreHistoryId: string): Promise<void>;
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
  findById(proposalId: string): Promise<MergeProposalRow | null>;
  listByAnalysis(analysisId: string): Promise<MergeProposalRow[]>;
  updateStatus(proposalId: string, status: MergeProposalRow['status']): Promise<void>;
}

/**
 * 프로젝트 저장소 계약입니다.
 */
export interface ProjectRepository {
  insert(project: Omit<ProjectRow, 'created_at' | 'updated_at'>): Promise<ProjectRow>;
  findById(projectId: string): Promise<ProjectRow | null>;
  findByUserId(userId: string): Promise<ProjectRow[]>;
}

/**
 * 프로젝트 워크스페이스 저장소 계약입니다.
 */
export interface ProjectWorkspaceRepository {
  insert(workspace: Omit<ProjectWorkspaceRow, 'created_at' | 'updated_at'>): Promise<ProjectWorkspaceRow>;
  findByPath(workspaceRootPath: string): Promise<ProjectWorkspaceRow | null>;
  listByProject(projectId: string): Promise<ProjectWorkspaceRow[]>;
}

/**
 * 브랜치 메타데이터 저장소 계약입니다.
 */
export interface BranchRepository {
  upsert(branch: Omit<BranchRow, 'created_at' | 'updated_at'>): Promise<BranchRow>;
  findByProjectAndName(projectId: string, branchName: string): Promise<BranchRow | null>;
  listByProject(projectId: string): Promise<BranchRow[]>;
  deleteByProjectAndName(projectId: string, branchName: string): Promise<void>;
}

/**
 * 워크트리 저장소 계약입니다.
 */
export interface WorktreeRepository {
  upsert(worktree: Omit<WorktreeRow, 'created_at' | 'updated_at'>): Promise<WorktreeRow>;
  findByPath(path: string): Promise<WorktreeRow | null>;
  listByProject(projectId: string): Promise<WorktreeRow[]>;
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
