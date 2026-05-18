import type {
  MergeAnalysisRepository,
  MergeAnalysisRow,
} from '@gitcat/shared-types';
import type { SQLiteDatabase } from '../../client/client';

/**
 * merge_analyses 테이블의 메타데이터 저장소입니다.
 *
 * 실제 분석 상세 JSON과 제안 본문은 로컬 파일 스토리지에 저장하고,
 * DB에는 상태, merge base, artifact path만 남깁니다.
 */
export class SqliteMergeAnalysisRepository implements MergeAnalysisRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  /**
   * 병합 분석 메타데이터를 저장하고 저장된 row를 반환합니다.
   */
  async insert(
    meta: Omit<MergeAnalysisRow, 'created_at'> & { created_at?: string },
  ): Promise<MergeAnalysisRow> {
    const createdAt = meta.created_at ?? new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO merge_analyses (
        analysis_id,
        source_worktree_instance_id,
        target_worktree_instance_id,
        merge_base,
        status,
        analysis_artifact_path,
        proposals_artifact_path,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      meta.analysis_id,
      meta.source_worktree_instance_id,
      meta.target_worktree_instance_id,
      meta.merge_base ?? null,
      meta.status,
      meta.analysis_artifact_path ?? null,
      meta.proposals_artifact_path ?? null,
      createdAt,
    );

    const row = await this.findById(meta.analysis_id);
    if (!row) {
      throw new Error(`merge_analyses row was not created: ${meta.analysis_id}`);
    }

    return row;
  }

  /**
   * analysis_id 기준으로 병합 분석 메타데이터를 조회합니다.
   */
  async findById(analysisId: string): Promise<MergeAnalysisRow | null> {
    const stmt = this.db.prepare('SELECT * FROM merge_analyses WHERE analysis_id = ?');
    const row = stmt.get(analysisId);
    return (row as MergeAnalysisRow | undefined) ?? null;
  }

  /**
   * 분석 진행 상태만 갱신합니다.
   */
  async updateStatus(
    analysisId: string,
    status: MergeAnalysisRow['status'],
  ): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE merge_analyses
      SET status = ?
      WHERE analysis_id = ?
    `);
    stmt.run(status, analysisId);
  }

  /**
   * 로컬 파일 스토리지에 생성된 분석/제안 artifact 경로를 연결합니다.
   *
   * undefined는 기존 값을 유지하고, null은 명시적으로 비우는 값으로 처리합니다.
   */
  async attachArtifactPaths(
    analysisId: string,
    artifacts: {
      analysis_artifact_path?: string | null;
      proposals_artifact_path?: string | null;
    },
  ): Promise<void> {
    const assignments: string[] = [];
    const params: Array<string | null> = [];

    if ('analysis_artifact_path' in artifacts) {
      assignments.push('analysis_artifact_path = ?');
      params.push(artifacts.analysis_artifact_path ?? null);
    }

    if ('proposals_artifact_path' in artifacts) {
      assignments.push('proposals_artifact_path = ?');
      params.push(artifacts.proposals_artifact_path ?? null);
    }

    if (assignments.length === 0) {
      return;
    }

    const stmt = this.db.prepare(`
      UPDATE merge_analyses
      SET ${assignments.join(', ')}
      WHERE analysis_id = ?
    `);
    stmt.run(...params, analysisId);
  }
}
