import { SQLiteDatabase } from '../../client/client';
import { MergeProposalRepository, MergeProposalRow } from '@gitcat/shared-types';

/**
 * AI 파이프라인에서 생성된 병합 제안(Merge Proposal) 데이터를 SQLite에 저장하고 조회하는 Repository 구현체입니다.
 * 
 * - 파서(Parser)가 모델 응답을 정제한 직후, 생성된 'ParsedAiResult'를 DB에 기록할 때 사용됩니다.
 * - 본문 텍스트나 코드 패치 원본 등 대용량 데이터는 파일로 저장되고, DB에는 메타데이터와 파일 참조 경로만 남깁니다.
 */
export class SqliteMergeProposalRepository implements MergeProposalRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  /**
   * 다수의 병합 제안(Merge Proposals)을 트랜잭션으로 묶어서 DB에 삽입합니다.
   * 
   * @param proposals DB에 삽입할 병합 제안 배열 (created_at은 생략 가능하며, 생략 시 현재 시각 자동 주입)
   */
  async insertMany(proposals: Array<Omit<MergeProposalRow, 'created_at'> & { created_at?: string }>): Promise<void> {
    if (proposals.length === 0) return;

    const now = new Date().toISOString();
    
    // 외래키(candidate_id)를 통해 상위 conflict_candidates 테이블과 연결됩니다.
    const stmt = this.db.prepare(`
      INSERT INTO merge_proposals (
        proposal_id, candidate_id, ai_request_id, file_path, feature_type,
        title, explanation_summary, confidence_score, validation_required,
        validation_summary, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 삽입 로직을 트랜잭션으로 묶어, 도중에 실패하더라도 롤백되도록 안전하게 처리합니다.
    const insertMany = this.db.transaction((items: Array<Omit<MergeProposalRow, 'created_at'> & { created_at?: string }>) => {
      for (const item of items) {
        stmt.run(
          item.proposal_id,
          item.candidate_id,
          item.ai_request_id ?? null,
          item.file_path,
          item.feature_type,
          item.title,
          item.explanation_summary ?? null,
          item.confidence_score ?? null,
          item.validation_required ? 1 : 0, // SQLite는 boolean을 0과 1로 저장합니다.
          item.validation_summary ?? null,
          item.status,
          item.created_at || now
        );
      }
    });

    insertMany(proposals);
  }

  /**
   * 특정 분석(Analysis ID)에 속하는 모든 병합 제안 목록을 가져옵니다.
   * 
   * @param analysisId 상위 병합 분석 세션 ID
   * @returns 해당 세션에서 도출된 모든 AI 병합 제안 목록 (최신순)
   */
  async listByAnalysis(analysisId: string): Promise<MergeProposalRow[]> {
    // conflict_candidates 테이블과 조인하여, 특정 analysis_id에 속하는 후보들의 제안서들만 필터링합니다.
    const stmt = this.db.prepare(`
      SELECT p.* 
      FROM merge_proposals p
      JOIN conflict_candidates c ON p.candidate_id = c.candidate_id
      WHERE c.analysis_id = ?
      ORDER BY p.created_at DESC
    `);
    
    const rows = stmt.all(analysisId) as Array<Omit<MergeProposalRow, 'validation_required'> & { validation_required: number }>;
    
    // SQLite에서 1/0으로 저장된 boolean 값을 TypeScript 타입에 맞게 boolean으로 복원합니다.
    return rows.map(row => ({
      ...row,
      validation_required: row.validation_required === 1
    }));
  }

  /**
   * 특정 병합 제안의 상태(Status)를 업데이트합니다.
   * 
   * @param proposalId 상태를 변경할 제안의 ID
   * @param status 변경할 새로운 상태 (예: 'accepted', 'rejected')
   */
  async updateStatus(proposalId: string, status: MergeProposalRow['status']): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE merge_proposals 
      SET status = ? 
      WHERE proposal_id = ?
    `);
    stmt.run(status, proposalId);
  }
}

