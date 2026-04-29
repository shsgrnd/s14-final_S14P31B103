import { Database } from 'better-sqlite3';
import { 
  ProposalFeedbackRepository, 
  CreateProposalFeedbackInput, 
  ProposalFeedbackRow 
} from '@gitcat/shared-types';

/**
 * 사용자가 AI의 병합 제안(Merge Proposal)에 대해 내린 피드백(수락/거절/수정)을 SQLite에 저장하는 Repository입니다.
 * 
 * - 사용자의 결정 이력은 이후 모델 학습(SFT/DPO)의 중요한 훈련 데이터 기준으로 사용됩니다.
 * - 본 Repository는 메타데이터와 결정 상태(status), 최종 코드 파일의 참조(ref) 경로 등을 관리합니다.
 */
export class SqliteProposalFeedbackRepository implements ProposalFeedbackRepository {
  constructor(private readonly db: Database) {}

  /**
   * 사용자의 피드백 데이터를 DB에 삽입합니다.
   * 
   * @param input 피드백 생성에 필요한 필수 데이터 (feedback_id 및 시간은 내부에서 자동 생성)
   * @returns DB에 성공적으로 삽입된 최종 ProposalFeedbackRow 객체
   */
  async insert(input: CreateProposalFeedbackInput): Promise<ProposalFeedbackRow> {
    // 고유한 피드백 ID(feedback_id)를 생성합니다. 형식: fb_YYYYMMDD_001
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const feedbackId = `fb_${today}_${randomSuffix}`;
    const decidedAt = new Date().toISOString();

    const row: ProposalFeedbackRow = {
      feedback_id: feedbackId,
      proposal_id: input.proposal_id,
      project_id: input.project_id,
      merge_proposal_id: input.merge_proposal_id ?? null,
      selection_status: input.selection_status,
      final_text: input.final_text ?? null,
      final_code_ref: input.final_code_ref ?? null,
      final_explanation: input.final_explanation ?? null,
      quality_tag: input.quality_tag ?? null,
      feedback_note: input.feedback_note ?? null,
      decided_at: decidedAt,
    };

    const stmt = this.db.prepare(`
      INSERT INTO proposal_feedbacks (
        feedback_id, proposal_id, project_id, merge_proposal_id, selection_status,
        final_text, final_code_ref, final_explanation, quality_tag, feedback_note, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      row.feedback_id,
      row.proposal_id,
      row.project_id,
      row.merge_proposal_id,
      row.selection_status,
      row.final_text,
      row.final_code_ref,
      row.final_explanation,
      row.quality_tag,
      row.feedback_note,
      row.decided_at
    );

    return row;
  }

  /**
   * 특정 프로젝트(Workspace) 내에서 발생한 사용자 피드백 목록을 최신순으로 조회합니다.
   * 
   * @param projectId 조회할 프로젝트 ID
   * @param limit 최대 반환 개수 (기본값: 50)
   */
  async listByProject(projectId: string, limit: number = 50): Promise<ProposalFeedbackRow[]> {
    const stmt = this.db.prepare(`
      SELECT * 
      FROM proposal_feedbacks 
      WHERE project_id = ? 
      ORDER BY decided_at DESC 
      LIMIT ?
    `);
    return stmt.all(projectId, limit) as ProposalFeedbackRow[];
  }

  /**
   * 특정 AI 병합 제안(Proposal)에 대해 사용자가 남긴 피드백 이력을 조회합니다.
   * 보통 1개의 제안에 1개의 피드백이 달리지만, 정책상 여러 번 수정 기록이 남을 수 있습니다.
   * 
   * @param proposalId 조회할 원본 제안 ID
   */
  async listByProposal(proposalId: string): Promise<ProposalFeedbackRow[]> {
    const stmt = this.db.prepare(`
      SELECT * 
      FROM proposal_feedbacks 
      WHERE proposal_id = ? 
      ORDER BY decided_at DESC
    `);
    return stmt.all(proposalId) as ProposalFeedbackRow[];
  }
}

