import {
  MergeProposalInput,
  MergeProposalInputSchema,
  ConflictCandidate
} from '@gitcat/shared-types';
import { GitClient } from '../ports/GitClient';
import { ConflictAnalyzer } from './ConflictAnalyzer';
import { WorkingTreeDiffManager } from './WorkingTreeDiffManager';
import { RelatedFilesCollector } from './RelatedFilesCollector';
import { TokenBudgetGuard } from './TokenBudgetGuard';

/**
 * AI 입력을 위한 최종 Payload(Context)를 조립하는 오케스트레이션 서비스.
 * 직접적인 로우 레벨 작업보다는 이미 구현된 Analyzer와 Client를 호출하여
 * 데이터를 취합하고 규격에 맞게 검증하는 역할을 수행합니다.
 */
export class AiInputService {
  /** working.diff 파일 생성 및 ref 반환 */
  private readonly workingTreeDiffManager: WorkingTreeDiffManager;
  /** related_files 수집, 필터링, 개수 제한 */
  private readonly relatedFilesCollector: RelatedFilesCollector;
  private readonly tokenBudgetGuard: TokenBudgetGuard;

  constructor(
    private readonly gitClient: GitClient,
    private readonly conflictAnalyzer: ConflictAnalyzer
  ) {
    this.workingTreeDiffManager = new WorkingTreeDiffManager(gitClient);
    this.relatedFilesCollector = new RelatedFilesCollector(gitClient);
    this.tokenBudgetGuard = new TokenBudgetGuard();
  }

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
    /** VS Code 워크스페이스 루트 절대 경로. working.diff 파일 저장 위치의 기준이 됩니다. */
    workspaceRoot?: string;
    workspaceSummary?: string;
  }): Promise<MergeProposalInput> {
    const {
      projectId, sessionId, currentBranch, targetBranch,
      analysisId, repoPath, workspaceRoot, workspaceSummary
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

    // ── Step 2: related_files 수집 (RelatedFilesCollector) ──────────────────────
    //
    // 기존 방식: candidates에서 file_path만 추출 → conflict 파일만 포함
    // 새 방식  : conflict 파일(우선) + git 변경 파일(보조) 합산
    //            + 바이너리/lock/빌드 폴더 제외 + 최대 50개 제한
    const conflictFilePaths = candidates.map(c => c.file_path);
    const relatedFilesResult = await this.relatedFilesCollector.collect(
      conflictFilePaths,
      repoPath
    );
    const relatedFiles = relatedFilesResult.files;


    let workingTreeDiffRef = '';

    if (workspaceRoot) {
      try {
        const diffResult = await this.workingTreeDiffManager.saveDiffAndGetRef(
          sessionId,
          workspaceRoot,
          repoPath
        );
        workingTreeDiffRef = diffResult.ref;

        // diff가 잘렸을 때 risk_summary에 경고를 남깁니다.
        // 이 정보는 AI가 "diff가 완전하지 않을 수 있다"는 맥락을 갖게 해줍니다.
        if (diffResult.truncated) {
          console.warn(
            `[AiInputService] working.diff truncated: ${diffResult.lineCount}줄로 제한됨. ` +
            `risk_summary에 경고 추가.`
          );
        }
      } catch (diffError) {
        // diff 파일 저장 실패 시 파이프라인 전체를 멈추지 않습니다.
        // working_tree_diff_ref가 없어도 conflict_candidates 정보만으로 AI 분석은 가능합니다.
        console.error('[AiInputService] working.diff 저장 실패 (파이프라인은 계속 진행합니다):', diffError);
      }
    } else {
      console.warn(
        '[AiInputService] workspaceRoot가 없어 working.diff 파일 저장을 건너뜁니다. ' +
        'buildMergeProposalInput()에 workspaceRoot를 전달하면 활성화됩니다.'
      );
    }

    // ── Step 4: 최종 Payload 조립 ────────────────────────────────────────────────
    const rawPayload: MergeProposalInput = {
      project_id: projectId,
      session_id: sessionId,
      feature_type: 'merge_patch_draft', // 기본값, 필요시 파라미터로 확장 가능
      current_branch: currentBranch,
      target_branch: targetBranch,
      workspace_summary: workspaceSummary || '',
      related_files: relatedFiles,
      conflict_candidates: candidates,
      working_tree_diff_ref: workingTreeDiffRef,
      risk_summary: '', // TokenBudgetGuard에서 추가될 수 있음
      schema_version: '1.0.0',
    };

    // ── Step 5: 토큰 사용량 측정 및 지능적 절단 (TokenBudgetGuard) ───────────────
    const optimizedPayload = this.tokenBudgetGuard.enforce(rawPayload);

    // ── Step 6: 데이터 무결성 검증 (Zod Validation) ─────────────────────────────
    //
    // Zod 스키마가 모든 필드의 타입과 형식을 최종 검증합니다.
    // 이 검증을 통과하면 AI 호출에 안전하게 사용할 수 있는 payload입니다.
    try {
      console.log(`[AiInputService] Validating payload with Zod...`);
      return MergeProposalInputSchema.parse(optimizedPayload);
    } catch (error) {
      console.error(`[AiInputService] Payload validation failed!`, error);
      throw new Error(`AI 입력 데이터 규격이 올바르지 않습니다. (Zod Schema Error)`);
    }
  }
}
