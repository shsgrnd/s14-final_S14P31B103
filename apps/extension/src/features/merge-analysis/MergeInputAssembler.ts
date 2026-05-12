import { createHash } from 'crypto';
import * as path from 'path';
import {
  MergeProposalInput,
  MergeProposalInputSchema,
  type ConflictCandidate,
} from '@gitcat/shared-types';
import type { DiffResult } from '@gitcat/git-core';
import type { GitService, WorktreeInfoResponse } from '../git/GitService';

export type MergeAiFeatureType = MergeProposalInput['feature_type'];

export interface MergeInputBuildRequest {
  source: string;
  target: string;
  sessionId?: string;
  projectIdOverride?: string;
  workspaceRootOverride?: string;
  sourceWorktreeInstanceIdOverride?: string;
  targetWorktreeInstanceIdOverride?: string;
  workspaceSummary?: string;
  riskSummary?: string;
}

export interface MergeBranchWorktreeContext {
  branchName: string;
  branchId: string;
  worktreePath: string;
  worktreeId: string;
  worktreeInstanceId: string;
  isCurrentWorktree: boolean;
  resolvedFrom: 'git-worktree' | 'current-worktree' | 'request';
}

export interface MergeAnalysisInputContext {
  projectId: string;
  sessionId: string;
  analysisId: string;
  source: MergeBranchWorktreeContext;
  target: MergeBranchWorktreeContext;
  currentBranch: string;
  repoRoot: string;
  currentWorktreePath: string;
  mergeBase: string;
  sourceDiffs: DiffResult[];
  targetDiffs: DiffResult[];
  branchDiffText: string;
  relatedFiles: string[];
  workingTreeDiffRef: string;
  // 실제 코드 본문 번들은 다음 단계에서 로컬 스토리지에 저장하고 이 ref로 연결합니다.
  contextBundleRef: string;
  workspaceSummary?: string;
  riskSummary?: string;
}

/**
 * 병합 분석과 AI 제안에 필요한 Git 입력을 조합하는 서비스입니다.
 *
 * 실제 충돌 후보 탐지나 저장은 다음 티켓에서 담당하고,
 * 여기서는 기존 GitService 메서드로 merge base, diff, worktree context만 수집합니다.
 */
export class MergeInputAssembler {
  constructor(private readonly gitService: GitService) {}

  /**
   * source/target 브랜치 기준 병합 분석용 raw context를 생성합니다.
   *
   * project/worktree/worktree instance는 이 메서드의 결과에서 필수로 확정합니다.
   * override 필드는 저장소에서 이미 확정한 값을 재사용해야 할 때만 사용합니다.
   */
  async buildAnalysisInput(request: MergeInputBuildRequest): Promise<MergeAnalysisInputContext> {
    const [status, worktrees, mergeBase] = await Promise.all([
      this.gitService.getStatus(),
      this.gitService.getWorktrees(),
      this.gitService.getMergeBase(request.source, request.target),
    ]);

    const repoRoot = request.workspaceRootOverride ?? status.repoRoot;
    const currentWorktreePath = status.currentWorktreePath ?? repoRoot;
    const projectId = request.projectIdOverride ?? this.projectId(repoRoot);
    // 4-2 단계에서는 DB 세션을 생성하지 않고, AI 입력에 필요한 워크플로 세션 ID만 보강합니다.
    const sessionId = request.sessionId ?? this.mergeSessionId(projectId, request.source, request.target, mergeBase);

    const [sourceDiffs, targetDiffs, branchDiffText] = await Promise.all([
      this.gitService.getDiff(mergeBase, request.source),
      this.gitService.getDiff(mergeBase, request.target),
      this.gitService.getDiffText(request.target, request.source),
    ]);

    const source = this.resolveBranchWorktree({
      projectId,
      branchName: request.source,
      requestedWorktreeInstanceId: request.sourceWorktreeInstanceIdOverride,
      worktrees,
      currentWorktreePath,
    });
    const target = this.resolveBranchWorktree({
      projectId,
      branchName: request.target,
      requestedWorktreeInstanceId: request.targetWorktreeInstanceIdOverride,
      worktrees,
      currentWorktreePath,
    });

    const relatedFiles = this.collectRelatedFiles(sourceDiffs, targetDiffs);
    const analysisId = this.analysisId(sessionId, request.source, request.target, mergeBase);
    const contextBundleRef = this.contextBundleRef(analysisId);

    return {
      projectId,
      sessionId,
      analysisId,
      source,
      target,
      currentBranch: status.currentBranch,
      repoRoot,
      currentWorktreePath,
      mergeBase,
      sourceDiffs,
      targetDiffs,
      branchDiffText,
      relatedFiles,
      workingTreeDiffRef: this.workingTreeDiffRef(analysisId, mergeBase, request.source, request.target),
      contextBundleRef,
      workspaceSummary: request.workspaceSummary ?? this.workspaceSummary(repoRoot, status.currentBranch),
      riskSummary: request.riskSummary,
    };
  }

  /**
   * 분석 context와 충돌 후보를 MergeProposalInputSchema 기준 AI 입력으로 변환합니다.
   */
  buildMergeProposalInput(
    context: MergeAnalysisInputContext,
    candidates: ConflictCandidate[],
    featureType: MergeAiFeatureType = 'merge_patch_draft',
  ): MergeProposalInput {
    const payload: MergeProposalInput = {
      project_id: context.projectId,
      session_id: context.sessionId,
      feature_type: featureType,
      current_branch: context.source.branchName,
      target_branch: context.target.branchName,
      workspace_summary: context.workspaceSummary,
      related_files: this.collectCandidateFiles(candidates, context.relatedFiles),
      conflict_candidates: candidates,
      working_tree_diff_ref: context.workingTreeDiffRef,
      context_bundle_ref: context.contextBundleRef,
      risk_summary: context.riskSummary,
      schema_version: 'merge-input-v1',
    };

    return MergeProposalInputSchema.parse(payload);
  }

  /**
   * 다음 단계 서비스들이 함께 쓸 수 있도록 분석 context와 AI 입력을 한 번에 구성합니다.
   */
  async buildMergeProposalRawInput(
    request: MergeInputBuildRequest,
    candidates: ConflictCandidate[],
    featureType: MergeAiFeatureType = 'merge_patch_draft',
  ): Promise<{ context: MergeAnalysisInputContext; aiInput: MergeProposalInput }> {
    const context = await this.buildAnalysisInput(request);
    return {
      context,
      aiInput: this.buildMergeProposalInput(context, candidates, featureType),
    };
  }

  private resolveBranchWorktree(input: {
    projectId: string;
    branchName: string;
    requestedWorktreeInstanceId?: string;
    worktrees: WorktreeInfoResponse[];
    currentWorktreePath: string;
  }): MergeBranchWorktreeContext {
    const branchId = this.branchId(input.projectId, input.branchName);
    const matched = input.worktrees.find((worktree) => worktree.branch === input.branchName);
    const worktreePath = matched?.path ?? input.currentWorktreePath;
    const worktreeId = this.worktreeId(input.projectId, worktreePath);
    const worktreeInstanceId = input.requestedWorktreeInstanceId
      ?? this.worktreeInstanceId(worktreeId, branchId);

    return {
      branchName: input.branchName,
      branchId,
      worktreePath,
      worktreeId,
      worktreeInstanceId,
      isCurrentWorktree: path.normalize(worktreePath) === path.normalize(input.currentWorktreePath),
      resolvedFrom: input.requestedWorktreeInstanceId
        ? 'request'
        : matched
          ? 'git-worktree'
          : 'current-worktree',
    };
  }

  private collectRelatedFiles(sourceDiffs: DiffResult[], targetDiffs: DiffResult[]): string[] {
    const files = new Set<string>();
    for (const diff of [...sourceDiffs, ...targetDiffs]) {
      files.add(diff.filePath);
      if (diff.oldPath) {
        files.add(diff.oldPath);
      }
    }
    return [...files].sort((a, b) => a.localeCompare(b));
  }

  private collectCandidateFiles(candidates: ConflictCandidate[], fallbackFiles: string[]): string[] {
    const files = new Set(fallbackFiles);
    for (const candidate of candidates) {
      files.add(candidate.file_path);
    }
    return [...files].sort((a, b) => a.localeCompare(b));
  }

  private workspaceSummary(repoRoot: string, currentBranch: string): string {
    return `repo=${path.basename(repoRoot)}; current_branch=${currentBranch}`;
  }

  private workingTreeDiffRef(analysisId: string, mergeBase: string, source: string, target: string): string {
    return `merge-analysis:${analysisId}:diff:${mergeBase}...${source}:${target}`;
  }

  private contextBundleRef(analysisId: string): string {
    return `merge-analysis:${analysisId}:context-bundle`;
  }

  private projectId(repoRoot: string): string {
    return `project_${hash(repoRoot)}`;
  }

  private branchId(projectId: string, branchName: string): string {
    return `branch_${hash(`${projectId}:${branchName}`)}`;
  }

  private worktreeId(projectId: string, worktreePath: string): string {
    return `worktree_${hash(`${projectId}:${worktreePath}`)}`;
  }

  private worktreeInstanceId(worktreeId: string, branchId: string): string {
    return `worktree_instance_${hash(`${worktreeId}:${branchId}`)}`;
  }

  private mergeSessionId(projectId: string, source: string, target: string, mergeBase: string): string {
    return `merge_session_${hash(`${projectId}:${source}:${target}:${mergeBase}`)}`;
  }

  private analysisId(sessionId: string, source: string, target: string, mergeBase: string): string {
    return `analysis_${hash(`${sessionId}:${source}:${target}:${mergeBase}`)}`;
  }
}

function hash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}
