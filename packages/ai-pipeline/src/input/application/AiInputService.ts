import { 
  MergeProposalInput, 
  MergeProposalInputSchema,
  ConflictCandidate 
} from '@gitcat/shared-types';
import { GitClient } from '../ports/GitClient';
import { ConflictAnalyzer } from './ConflictAnalyzer';

/**
 * AI 입력을 위한 최종 Payload(Context)를 조립하는 오케스트레이션 서비스.
 * 직접적인 로우 레벨 작업보다는 이미 구현된 Analyzer와 Client를 호출하여
 * 데이터를 취합하고 규격에 맞게 검증하는 역할을 수행합니다.
 */
export class AiInputService {
  constructor(
    private readonly gitClient: GitClient,
    private readonly conflictAnalyzer: ConflictAnalyzer
  ) {}

  /**
   * 병합 제안 및 충돌 분석 기능을 위한 AI 입력 Payload를 생성합니다.
   * 
   * @param params Payload 생성에 필요한 기본 식별 정보 및 브랜치 정보
   * @returns Zod 검증을 통과한 유효한 MergeProposalInput 객체
   */
  async buildMergeProposalInput(params: {
    projectId: string;
    sessionId: string;
    currentBranch: string;
    targetBranch: string;
    analysisId: string;
    repoPath?: string;
    workspaceSummary?: string;
  }): Promise<MergeProposalInput> {
    const { 
      projectId, sessionId, currentBranch, targetBranch, 
      analysisId, repoPath, workspaceSummary 
    } = params;

    console.log(`[AiInputService] Building payload for session: ${sessionId}, analysis: ${analysisId}`);

    // 1. 충돌 분석기 호출 (Domain Service 호출)
    // 3-Way Diff 및 AST 분석 결과를 가져옵니다.
    const candidates: ConflictCandidate[] = await this.conflictAnalyzer.analyze(
      currentBranch, 
      targetBranch, 
      analysisId, 
      repoPath
    );

    // 2. 관련 파일 목록 추출 (중복 제거)
    const relatedFiles = Array.from(new Set(candidates.map(c => c.file_path)));

    // 3. 작업 트리 변경 사항(Diff) 수집 (Infrastructure Port 호출)
    // 현재 staged 된 변경 사항 등을 참고용으로 수집합니다.
    const workingTreeDiff = await this.gitClient.getStagedDiff(repoPath);

    // 4. 최종 Payload 조립
    const rawPayload: MergeProposalInput = {
      project_id: projectId,
      session_id: sessionId,
      feature_type: 'merge_patch_draft', // 기본값, 필요시 파라미터로 확장 가능
      current_branch: currentBranch,
      target_branch: targetBranch,
      workspace_summary: workspaceSummary || '',
      related_files: relatedFiles,
      conflict_candidates: candidates,
      working_tree_diff_ref: workingTreeDiff || '',
      risk_summary: '', // 추후 분석 결과에 따라 채워질 수 있음
      schema_version: '1.0.0',
    };

    // 5. 데이터 무결성 검증 (Zod Validation)
    // 규격에 맞지 않는 데이터가 AI에게 전달되어 비용이 낭비되거나 에러가 나는 것을 방지합니다.
    try {
      console.log(`[AiInputService] Validating payload with Zod...`);
      return MergeProposalInputSchema.parse(rawPayload);
    } catch (error) {
      console.error(`[AiInputService] Payload validation failed!`, error);
      throw new Error(`AI 입력 데이터 규격이 올바르지 않습니다. (Zod Schema Error)`);
    }
  }
}
