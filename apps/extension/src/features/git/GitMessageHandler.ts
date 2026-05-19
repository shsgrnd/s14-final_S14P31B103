/**
 * GitMessageHandler — Git 관련 Inbound 메시지 처리기
 *
 * MessageRouter에서 Git 관련 메시지 type을 받아
 * GitService를 호출하고 Webview에 응답을 전송한다.
 *
 * 이 클래스는 다음 메시지를 담당한다:
 *   REFRESH_STATUS, GET_BRANCH_LIST,
 *   APPLY_BRANCH, CHECKOUT_BRANCH, DELETE_BRANCHES,
 *   GIT_ADD_ALL, APPLY_COMMIT, EXECUTE_COMMIT, GIT_PUSH, EXECUTE_PULL,
 *   RUN_MERGE, OPEN_MERGE_PANEL
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { GitService, type GitStatusResponse } from './GitService';
import { BranchCleanupService } from './BranchCleanupService';
import type { MergeConflictCandidateView } from '@gitcat/shared-types';
import type { MergeConflictGuardService } from '../merge-analysis/MergeConflictGuardService';
import type { MessageRouter } from '../../core/MessageRouter';
import { gitcatLog, gitcatLogWarn } from '../../platform/GitCatLog';
import { createHash } from 'crypto';

export class GitMessageHandler {
  private mergeConflictGuardService: MergeConflictGuardService | null = null;
  private messageRouter: MessageRouter | null = null;
  /** RUN_MERGE retry 직전 워킹트리 스냅샷(AI 반영본). git merge가 마커로 덮어쓴 뒤 복원에 사용 */
  private mergeWorkspaceSnapshot: Map<string, string> | null = null;

  constructor(
    private readonly gitService: GitService,
    private readonly branchCleanupService: BranchCleanupService
  ) {}

  public setMessageRouter(router: MessageRouter): void {
    this.messageRouter = router;
  }

  public setMergeConflictGuardService(service: MergeConflictGuardService): void {
    this.mergeConflictGuardService = service;
  }

  /**
   * Git 관련 메시지를 라우팅하고 응답을 전송한다.
   * 반환값: 처리 여부 (true = 처리됨, false = 이 핸들러 범위 외)
   */
  async handle(type: string, payload: any, webview: vscode.Webview): Promise<boolean> {
    switch (type) {
      // ─── 상태 조회 ──────────────────────────────────────────────────────
      case 'REFRESH_STATUS':
        await this.handleRefreshStatus(webview, payload);
        return true;

      case 'GET_GIT_STATUS_SUMMARY':
        await this.handleGetGitStatusSummary(webview, payload);
        return true;

      case 'GET_BRANCH_LIST':
        await this.handleGetBranchList(webview);
        return true;

      case 'GET_WORKTREE_LIST':
        await this.handleGetWorktreeList(webview);
        return true;

      // ─── 브랜치 작업 ─────────────────────────────────────────────────────
      case 'APPLY_BRANCH':
        await this.handleApplyBranch(payload, webview);
        return true;

      case 'CHECKOUT_BRANCH':
        await this.handleCheckoutBranch(payload, webview);
        return true;

      case 'DELETE_BRANCHES':
        await this.handleDeleteBranches(payload, webview);
        return true;

      // ─── Stage / Unstage ─────────────────────────────────────────────────
      case 'GIT_ADD_ALL':
        await this.handleGitAddAll(webview);
        return true;

      case 'GIT_STAGE_FILES':
        await this.handleGitStageFiles(payload, webview);
        return true;

      case 'GIT_UNSTAGE_FILES':
        await this.handleGitUnstageFiles(payload, webview);
        return true;

      // ─── Commit / Push / Pull ─────────────────────────────────────────────
      case 'APPLY_COMMIT':
        await this.handleCommit(payload, webview);
        return true;

      case 'EXECUTE_COMMIT':
        await this.handleCommit(payload, webview);
        return true;

      case 'GIT_PUSH':
        await this.handlePush(webview, payload as { skipGuard?: boolean } | undefined);
        return true;

      case 'EXECUTE_PULL':
        await this.handlePull(webview, payload as { skipGuard?: boolean } | undefined);
        return true;

      // ─── Merge ───────────────────────────────────────────────────────────
      case 'RUN_MERGE':
        await this.handleRunMerge(payload as { source: string; target?: string; skipGuard?: boolean }, webview);
        return true;

      case 'MERGE_ABORT':
      case 'GIT_MERGE_ABORT':
        await this.handleMergeAbort(webview);
        return true;

      case 'MERGE_CONTINUE':
      case 'GIT_MERGE_CONTINUE':
        await this.handleMergeContinue(webview);
        return true;

      case 'OPEN_MERGE_PANEL':
        // 프론트가 패널을 직접 열도록 상태만 새로고침
        await this.handleRefreshStatus(webview);
        return true;

      // ─── Stash ───────────────────────────────────────────────────────────
      case 'GET_STASH_LIST':
        await this.handleGetStashList(webview);
        return true;

      case 'STASH_SAVE':
      case 'GIT_STASH_SAVE':
        await this.handleStashSave(payload, webview);
        return true;

      case 'STASH_APPLY':
      case 'GIT_STASH_APPLY':
        await this.handleStashApply(payload, webview);
        return true;

      case 'STASH_POP':
      case 'GIT_STASH_POP':
        await this.handleStashPop(payload, webview);
        return true;

      case 'STASH_DROP':
      case 'GIT_STASH_DROP':
        await this.handleStashDrop(payload, webview);
        return true;

      // ─── Unstage ─────────────────────────────────────────────────────────
      case 'GIT_UNSTAGE':
        await this.handleGitUnstage(payload, webview);
        return true;

      // ─── 로컬 브랜치 정리 ────────────────────────────────────────────────
      case 'GET_BRANCH_CLEANUP_SETTINGS':
        await this.handleGetBranchCleanupSettings(webview);
        return true;

      case 'SAVE_BRANCH_CLEANUP_SETTINGS':
        await this.handleSaveBranchCleanupSettings(payload, webview);
        return true;

      case 'GET_BRANCH_CLEANUP_CANDIDATES':
        await this.handleGetBranchCleanupCandidates(webview);
        return true;

      case 'EXECUTE_BRANCH_CLEANUP':
        await this.handleExecuteBranchCleanup(payload, webview);
        return true;

      default:
        return false;
    }
  }

  // ─── 핸들러 구현 ──────────────────────────────────────────────────────────

  private async handleRefreshStatus(
    webview: vscode.Webview,
    payload?: { fetchRemote?: boolean },
  ): Promise<void> {
    this.sendLoading(webview, 'status', true);
    try {
      const fetchRemote = payload?.fetchRemote ?? true;
      if (fetchRemote) {
        await this.gitService.fetchAllPrune();
      }
      const [status, branches, summary] = await Promise.all([
        this.gitService.getStatusWithWorktrees({ fetchRemote }),
        this.gitService.getBranches(),
        this.gitService.getStatusSummary({ fetchRemote }),
      ]);
      webview.postMessage({
        type: 'GIT_STATUS_UPDATED',
        payload: { status },
      });
      webview.postMessage({
        type: 'GIT_STATUS_SUMMARY',
        payload: { summary },
      });
      webview.postMessage({
        type: 'BRANCH_LIST',
        payload: { branches },
      });
      if (status.worktrees) {
        webview.postMessage({
          type: 'WORKTREE_LIST',
          payload: { worktrees: status.worktrees },
        });
      }
    } finally {
      this.sendLoading(webview, 'status', false);
    }
  }

  private async handleGetBranchList(webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'branches', true);
    try {
      const branches = await this.gitService.getBranches();
      webview.postMessage({
        type: 'BRANCH_LIST',
        payload: { branches },
      });
    } finally {
      this.sendLoading(webview, 'branches', false);
    }
  }

  private async handleGetGitStatusSummary(
    webview: vscode.Webview,
    payload?: { fetchRemote?: boolean },
  ): Promise<void> {
    this.sendLoading(webview, 'statusSummary', true);
    try {
      const summary = await this.gitService.getStatusSummary({
        fetchRemote: payload?.fetchRemote ?? false,
      });
      webview.postMessage({
        type: 'GIT_STATUS_SUMMARY',
        payload: { summary },
      });
    } finally {
      this.sendLoading(webview, 'statusSummary', false);
    }
  }

  private async handleGetWorktreeList(webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'worktrees', true);
    try {
      const worktrees = await this.gitService.getWorktrees();
      webview.postMessage({
        type: 'WORKTREE_LIST',
        payload: { worktrees },
      });
    } finally {
      this.sendLoading(webview, 'worktrees', false);
    }
  }

  private async handleApplyBranch(payload: { name: string }, webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'branch', true);
    try {
      const result = await this.gitService.applyBranch(payload.name);
      this.sendOperationResult(webview, 'APPLY_BRANCH', result);
      if (result.success) {
        this.sendNotification(webview, 'info', result.message ?? '브랜치가 전환되었습니다.');
        // 상태 갱신
        await this.handleRefreshStatus(webview);
        await this.handleGetBranchList(webview);
      } else {
        this.sendError(webview, result.message ?? '브랜치 전환에 실패했습니다.');
      }
    } finally {
      this.sendLoading(webview, 'branch', false);
    }
  }

  private async handleCheckoutBranch(payload: { name: string }, webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'branch', true);
    try {
      const result = await this.gitService.checkoutBranch(payload.name);
      this.sendOperationResult(webview, 'CHECKOUT_BRANCH', result);
      if (result.success) {
        this.sendNotification(webview, 'info', result.message ?? '브랜치가 전환되었습니다.');
        await this.handleRefreshStatus(webview);
        await this.handleGetBranchList(webview);
      } else {
        this.sendError(webview, result.message ?? '브랜치 전환에 실패했습니다.');
      }
    } finally {
      this.sendLoading(webview, 'branch', false);
    }
  }

  private async handleDeleteBranches(
    payload: { names: string[]; force: boolean },
    webview: vscode.Webview,
  ): Promise<void> {
    this.sendLoading(webview, 'branches', true);
    try {
      const result = await this.gitService.deleteBranches(payload.names, payload.force);
      this.sendOperationResult(webview, 'DELETE_BRANCHES', result);
      if (result.success) {
        this.sendNotification(webview, 'info', result.message ?? '브랜치가 삭제되었습니다.');
        await this.handleGetBranchList(webview);
      } else {
        this.sendError(webview, result.message ?? '브랜치 삭제에 실패했습니다.');
      }
    } finally {
      this.sendLoading(webview, 'branches', false);
    }
  }

  private async handleGitAddAll(webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'stage', true);
    try {
      await this.gitService.stageAll();
      this.sendOperationResult(webview, 'GIT_ADD_ALL', { success: true });
      this.sendNotification(webview, 'info', '모든 변경사항이 스테이징되었습니다.');
      await this.handleRefreshStatus(webview);
    } finally {
      this.sendLoading(webview, 'stage', false);
    }
  }

  private async handleGitStageFiles(
    payload: { paths?: string[]; filePaths?: string[] },
    webview: vscode.Webview,
  ): Promise<void> {
    const filePaths = payload.paths ?? payload.filePaths ?? [];
    this.sendLoading(webview, 'stage', true);
    try {
      await this.gitService.stageFiles(filePaths);
      this.sendOperationResult(webview, 'GIT_STAGE_FILES', { success: true });
      this.sendNotification(webview, 'info', `${filePaths.length} file(s) staged.`);
      await this.handleRefreshStatus(webview);
    } finally {
      this.sendLoading(webview, 'stage', false);
    }
  }

  private async handleGitUnstageFiles(
    payload: { paths?: string[]; filePaths?: string[] },
    webview: vscode.Webview,
  ): Promise<void> {
    const filePaths = payload.paths ?? payload.filePaths ?? [];
    this.sendLoading(webview, 'stage', true);
    try {
      await this.gitService.unstageFiles(filePaths);
      this.sendOperationResult(webview, 'GIT_UNSTAGE_FILES', { success: true });
      this.sendNotification(webview, 'info', `${filePaths.length} file(s) unstaged.`);
      await this.handleRefreshStatus(webview);
    } finally {
      this.sendLoading(webview, 'stage', false);
    }
  }

  private async handleCommit(
    payload: { message: string; body?: string },
    webview: vscode.Webview,
  ): Promise<void> {
    this.sendLoading(webview, 'commit', true);
    try {
      // 커밋 전 가드: staged가 없으면 빈 커밋을 만들지 않고 명확히 거부한다.
      const status = await this.gitService.getStatus();
      if ((status.staged?.length ?? 0) === 0) {
        const message = '스테이징된 변경사항이 없습니다. 먼저 변경 파일을 stage 해주세요.';
        this.sendOperationResult(webview, 'EXECUTE_COMMIT', { success: false, message });
        this.sendError(webview, message);
        return;
      }

      const result = await this.gitService.runCommit(payload.message, payload.body);
      this.sendOperationResult(webview, 'EXECUTE_COMMIT', result);
      if (result.success) {
        this.sendNotification(webview, 'info', result.message ?? '커밋이 완료되었습니다.');
        await this.handleRefreshStatus(webview);
      } else {
        this.sendError(webview, result.message ?? '커밋에 실패했습니다.');
      }
    } finally {
      this.sendLoading(webview, 'commit', false);
    }
  }

  private async handlePush(webview: vscode.Webview, opts?: { skipGuard?: boolean }): Promise<void> {
    this.sendLoading(webview, 'push', true);
    try {
      // 충돌 검토 후 재시도는 AI 반영·커밋을 우선 — behind 검사로 막지 않음
      if (!opts?.skipGuard) {
        const shouldPullFirst = await this.blockPushWhenTrackingBranchBehind(webview);
        if (shouldPullFirst) {
          return;
        }
      }

      // skipGuard=true: 충돌 검토 후 재시도.
      // ACCEPT_MERGE가 로컬 파일에만 내용을 기록하므로, 수정된 파일을 자동으로
      // stage + commit 하고 push 해야 변경사항이 원격에 실제로 반영된다.
      if (opts?.skipGuard) {
        await this.autoCommitAcceptedChanges();
      }

      // Push할 커밋이 있는지 먼저 확인한다.
      // 커밋이 없으면 충돌 가드도 실행하지 않는다 —
      // 이미 push가 완료된 상태에서 가드를 재실행하면 같은 충돌 경고를 반복해서 보여주게 된다.
      try {
        const branches = await this.gitService.getBranches();
        const currentBranch = branches.find((b) => b.isCurrent);

        // 원격 트래킹 브랜치(upstream)가 설정되어 있을 때만 "Push할 커밋 유무"를 검증한다.
        // 트래킹 브랜치가 없다면 신규 브랜치의 첫 푸시이므로 정상 진행시켜야 한다.
        if (currentBranch && currentBranch.trackingBranch) {
          const unpushed = await this.gitService.getUnpushedFiles();
          if (unpushed.length === 0) {
            if (opts?.skipGuard) {
              // 충돌 검토 후 재시도 시: 이미 앞선 retry에서 push가 완료된 상태.
              // 병합 리뷰 UI를 닫고 완료 알림을 broadcast 한다.
              this.notifySuccessAllWebviews(webview, 'Push가 완료되었습니다.');
            } else {
              const message = 'Push할 새로운 커밋이 없습니다. (이미 원격 저장소와 최신 상태입니다)';
              this.sendOperationResult(webview, 'GIT_PUSH', { success: false, message });
              this.sendNotification(webview, 'info', message);
            }
            return;
          }
        }
      } catch (error) {
        gitcatLogWarn('[GitCat] Push 가드 검증 중 예외 발생:', error);
      }

      // 실제 push할 커밋이 있을 때만 충돌 가드를 실행한다.
      if (!opts?.skipGuard) {
        const blocked = await this.guardPushTargetMergeConflict(webview);
        if (blocked) {
          return;
        }
      }

      const result = await this.gitService.push();
      this.sendOperationResult(webview, 'GIT_PUSH', result);
      if (result.success) {
        this.sendNotification(webview, 'info', result.message ?? 'Push가 완료되었습니다.');
        await this.handleRefreshStatus(webview);
      } else {
        this.sendError(webview, result.message ?? 'Push에 실패했습니다.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.notifyErrorAllWebviews(webview, message || 'Push에 실패했습니다.');
    } finally {
      this.sendLoading(webview, 'push', false);
    }
  }

  /**
   * 충돌 검토 후 재시도 시 ACCEPT_MERGE로 작성된 로컬 파일을 자동으로 stage + commit 합니다.
   * 변경 파일이 없으면 아무것도 하지 않습니다.
   */
  private async autoCommitAcceptedChanges(): Promise<void> {
    try {
      const status = await this.gitService.getStatus();
      const hasModified = status.unstaged.length > 0 || status.staged.length > 0;
      if (!hasModified) {
        return;
      }
      await this.gitService.stageAll();
      await this.gitService.runCommit('GitCat: AI 병합 제안 적용');
    } catch (error) {
      // Auto-commit 실패는 push 자체를 막지 않도록 경고만 로깅합니다.
      gitcatLogWarn('[GitCat] autoCommitAcceptedChanges 실패:', error);
    }
  }

  private async handlePull(webview: vscode.Webview, opts?: { skipGuard?: boolean }): Promise<void> {
    this.sendLoading(webview, 'pull', true);
    try {
      if (!opts?.skipGuard) {
        const blocked = await this.guardPullTrackingMergeConflict(webview);
        if (blocked) {
          return;
        }
      }

      if (opts?.skipGuard) {
        await this.autoCommitAcceptedChanges();
        const status = await this.gitService.getStatus();
        gitcatLog(
          `[GitCat] EXECUTE_PULL retry: isMerging=${status.isMerging}, conflicted=[${status.conflicted.map((f) => f.path).join(',')}]`,
        );

        if (status.isMerging || status.conflicted.length > 0) {
          if (status.isMerging) {
            const finalized = await this.tryFinalizeInProgressMerge(
              webview,
              status,
              'Pull이 완료되었습니다.',
            );
            if (finalized) {
              return;
            }
          }
          await this.publishPullConflictForInProgressMerge(webview, status);
          return;
        }

        const snapshotPaths = this.collectPathsForMergeSnapshot(status);
        this.mergeWorkspaceSnapshot = await this.captureWorkspaceSnapshot(
          status.repoRoot,
          snapshotPaths,
        );
        gitcatLog(
          `[GitCat] EXECUTE_PULL retry: snapshot ${this.mergeWorkspaceSnapshot.size} file(s) before git pull`,
        );
      }

      const result = await this.gitService.pull();
      this.mergeWorkspaceSnapshot = null;
      this.sendOperationResult(webview, 'EXECUTE_PULL', result);
      if (result.success) {
        this.notifySuccessAllWebviews(webview, 'Pull이 완료되었습니다.');
        await this.handleRefreshStatus(webview);
      } else {
        this.sendError(webview, result.message ?? 'Pull에 실패했습니다.');
      }
    } catch (error) {
      await this.handlePullConflictFailure(webview, error);
    } finally {
      this.sendLoading(webview, 'pull', false);
    }
  }

  /**
   * git pull 실패 후 MERGING/unmerged 상태면 finalize 시도 → 실패 시 CONFLICT_RESULT(pull).
   */
  private async handlePullConflictFailure(webview: vscode.Webview, error: unknown): Promise<void> {
    const status = await this.gitService.getStatus();
    const failureMessage = error instanceof Error ? error.message : String(error);
    const gitConflictedPaths = status.conflicted.map((f) => f.path);

    if (status.isMerging || gitConflictedPaths.length > 0) {
      gitcatLog('[GitCat] pull failed with merge conflict — try finalize then publish git unmerged paths');
      if (status.isMerging) {
        const finalized = await this.tryFinalizeInProgressMerge(
          webview,
          status,
          'Pull이 완료되었습니다.',
        );
        if (finalized) {
          this.mergeWorkspaceSnapshot = null;
          return;
        }
      }

      await this.publishPullConflictForInProgressMerge(webview, status, gitConflictedPaths);
      this.sendOperationResult(webview, 'EXECUTE_PULL', {
        success: false,
        message: failureMessage,
      });
      this.notifyWarningAllWebviews(
        webview,
        gitConflictedPaths.length > 0
          ? `Pull 중 충돌이 남아 있습니다: ${gitConflictedPaths.join(', ')}. 해결한 뒤 Pull 다시 시도해 주세요.`
          : 'Pull 중 병합 충돌이 발생했습니다. 해결한 뒤 Pull 다시 시도해 주세요.',
      );
      await this.handleRefreshStatus(webview);
      return;
    }

    this.notifyErrorAllWebviews(webview, failureMessage || 'Pull에 실패했습니다.');
  }

  private async publishPullConflictForInProgressMerge(
    webview: vscode.Webview,
    status: GitStatusResponse,
    extraGitPaths?: string[],
  ): Promise<void> {
    const trackingState = await this.mergeConflictGuardService?.getCurrentTrackingBranchState();
    const sourceBranch = trackingState?.sourceBranch ?? status.currentBranch;
    const targetBranch =
      trackingState?.hasTrackingBranch === true
        ? trackingState.trackingBranch
        : status.currentBranch;

    await this.publishInProgressMergeConflict(
      webview,
      {
        triggeringAction: 'pull',
        sourceBranch,
        targetBranch,
        targetScope: 'remote',
      },
      status,
      extraGitPaths,
    );
  }

  /**
   * 병합 충돌 검토 후 재시도 시, git이 이미 MERGING 상태인 경우 처리합니다.
   * 수락된 AI 제안으로 작성된 파일들을 스테이징하고 merge --continue를 실행합니다.
   */
  private async handleMergeContinueAfterReview(
    webview: vscode.Webview,
    status: GitStatusResponse,
    successMessage = 'Pull이 완료되었습니다.',
  ): Promise<void> {
    // ACCEPT_MERGE는 워크스페이스 파일만 덮어쓰므로, git 인덱스에 unmerged 엔트리(stage 1,2,3)가
    // 남아있을 수 있다. git add <file>로 명시적으로 해소한 뒤, 나머지 수정 파일도 함께 스테이징해야
    // `git commit --no-edit`이 "You have unmerged paths" 오류 없이 성공한다.
    const conflictedPaths = status.conflicted.map((f) => f.path);
    gitcatLog(`[GitCat] handleMergeContinueAfterReview: conflictedPaths=[${conflictedPaths.join(',')}]`);

    const repoRoot = status.repoRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    gitcatLog(`[GitCat] handleMergeContinueAfterReview: repoRoot=${repoRoot}`);

    if (conflictedPaths.length > 0) {
      await this.resolveConflictMarkersForMergeContinue(repoRoot, conflictedPaths);
    }

    // 커밋 전, 충돌 파일에 conflict 마커가 남아있으면 커밋을 거부한다.
    // (REJECT_MERGE 또는 미해결 상태에서 retry를 누른 경우 방지)
    const markerFiles = await this.findFilesWithConflictMarkers(repoRoot, conflictedPaths);
    gitcatLog(`[GitCat] handleMergeContinueAfterReview: markerFiles=[${markerFiles.join(',')}]`);
    if (markerFiles.length > 0) {
      throw new Error(
        `다음 파일에 충돌 마커(<<<<<<, =======, >>>>>>>)가 남아있습니다: ${markerFiles.join(', ')}\n` +
        '직접 편집하여 충돌을 해소한 뒤 다시 시도해주세요.',
      );
    }

    if (conflictedPaths.length > 0) {
      gitcatLog(`[GitCat] stageFiles: ${conflictedPaths.join(',')}`);
      await this.gitService.stageFiles(conflictedPaths);
    }
    gitcatLog('[GitCat] stageAll');
    await this.gitService.stageAll();

    gitcatLog('[GitCat] mergeContinue (git commit --no-edit)');
    await this.gitService.mergeContinue();
    gitcatLog('[GitCat] mergeContinue success, sending notification');
    this.mergeWorkspaceSnapshot = null;
    this.broadcastMergeComplete(webview, {
      status: 'continued',
      message: successMessage,
      completedAt: new Date().toISOString(),
    });
    this.notifySuccessAllWebviews(webview, successMessage);
    await this.handleRefreshStatus(webview);
  }

  private collectPathsForMergeSnapshot(status: GitStatusResponse): string[] {
    return [
      ...new Set([
        ...status.conflicted.map((f) => f.path),
        ...status.unstaged.map((f) => f.path),
        ...status.staged.map((f) => f.path),
      ]),
    ];
  }

  private async captureWorkspaceSnapshot(
    repoRoot: string,
    filePaths: string[],
  ): Promise<Map<string, string>> {
    const snapshot = new Map<string, string>();
    for (const filePath of filePaths) {
      try {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
        snapshot.set(filePath, await fs.readFile(absolutePath, 'utf8'));
      } catch {
        // 읽을 수 없는 경로는 스냅샷에서 제외
      }
    }
    return snapshot;
  }

  /**
   * git merge가 워킹트리에 남긴 충돌 마커를 제거한다.
   * 우선 AI 반영 직전 스냅샷, 없으면 checkout --ours, 그래도 마커면 인덱스 stage 2.
   */
  private async resolveConflictMarkersForMergeContinue(
    repoRoot: string,
    filePaths: string[],
  ): Promise<void> {
    const markerFiles = await this.findFilesWithConflictMarkers(repoRoot, filePaths);
    if (markerFiles.length === 0) {
      return;
    }

    gitcatLog(
      `[GitCat] resolveConflictMarkersForMergeContinue: markers in [${markerFiles.join(',')}]`,
    );

    const restoredFromSnapshot: string[] = [];
    for (const filePath of markerFiles) {
      const snapshotContent = this.mergeWorkspaceSnapshot?.get(filePath);
      if (snapshotContent && !snapshotContent.includes('<<<<<<<')) {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
        await fs.writeFile(absolutePath, snapshotContent, 'utf8');
        restoredFromSnapshot.push(filePath);
      }
    }

    const stillMarked = await this.findFilesWithConflictMarkers(
      repoRoot,
      markerFiles.filter((p) => !restoredFromSnapshot.includes(p)),
    );
    if (stillMarked.length === 0) {
      return;
    }

    try {
      await this.gitService.checkoutMergeOurs(stillMarked);
      gitcatLog(`[GitCat] checkout --ours: ${stillMarked.join(',')}`);
    } catch (error) {
      gitcatLogWarn('[GitCat] checkout --ours failed:', error);
    }

    const afterOurs = await this.findFilesWithConflictMarkers(repoRoot, stillMarked);
    for (const filePath of afterOurs) {
      try {
        const content = await this.gitService.readIndexStage(filePath, 2);
        if (!content.includes('<<<<<<<')) {
          const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
          await fs.writeFile(absolutePath, content, 'utf8');
          gitcatLog(`[GitCat] restored from index stage 2: ${filePath}`);
        }
      } catch (error) {
        gitcatLogWarn(`[GitCat] readIndexStage(2) failed for ${filePath}:`, error);
      }
    }
  }

  private async findFilesWithConflictMarkers(repoRoot: string, filePaths: string[]): Promise<string[]> {
    const markerFiles: string[] = [];
    for (const filePath of filePaths) {
      try {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
        const content = await fs.readFile(absolutePath, 'utf8');
        // `<<<<<<< ` (7 `<` + space) is the canonical Git conflict marker start.
        // Using only `<<<<<<<` avoids the false-positive risk from `=======` or `>>>>>>>`.
        if (content.includes('<<<<<<<')) {
          markerFiles.push(filePath);
        }
      } catch {
        // 파일을 읽을 수 없으면 무시
      }
    }
    return markerFiles;
  }

  private async blockPushWhenTrackingBranchBehind(webview: vscode.Webview): Promise<boolean> {
    if (!this.mergeConflictGuardService) {
      return false;
    }

    const trackingState = await this.mergeConflictGuardService.getCurrentTrackingBranchState();
    if (!trackingState.hasTrackingBranch || trackingState.behind <= 0) {
      return false;
    }

    const message = `원격 브랜치(${trackingState.trackingBranch})에 먼저 받아야 할 변경이 있습니다. pull로 동기화한 뒤 다시 push해 주세요.`;
    this.sendOperationResult(webview, 'GIT_PUSH', { success: false, message });
    this.notifyWarningAllWebviews(webview, message);
    return true;
  }

  private async guardPushTargetMergeConflict(webview: vscode.Webview): Promise<boolean> {
    if (!this.mergeConflictGuardService) {
      return false;
    }

    const result = await this.mergeConflictGuardService.guardDefaultTargetWithFallback();
    if (result.skipped || !result.hasConflicts) {
      return false;
    }

    const message = `원격 target 브랜치(${result.targetBranch})와 병합 충돌 가능성이 있습니다. 추천 확인 후 다시 push해 주세요.`;
    const conflictPayload = {
      analysisId: result.analysis.analysisId,
      artifactPath: result.analysis.artifactPath,
      candidates: result.analysis.candidates,
      triggeringAction: 'push' as const,
    };
    if (this.messageRouter) {
      this.messageRouter.publishConflictResult(conflictPayload);
    } else {
      webview.postMessage({ type: 'CONFLICT_RESULT', payload: conflictPayload });
    }
    this.sendOperationResult(webview, 'GIT_PUSH', { success: false, message });
    this.notifyWarningAllWebviews(webview, message);
    return true;
  }

  private async guardPullTrackingMergeConflict(webview: vscode.Webview): Promise<boolean> {
    if (!this.mergeConflictGuardService) {
      return false;
    }

    const result = await this.mergeConflictGuardService.guardTrackingBranch();
    if (result.skipped || !result.hasConflicts) {
      return false;
    }

    const message = `원격 브랜치(${result.targetBranch})를 pull하면 병합 충돌 가능성이 있습니다. 추천 확인 후 동기화를 진행해 주세요.`;
    const conflictPayload = {
      analysisId: result.analysis.analysisId,
      artifactPath: result.analysis.artifactPath,
      candidates: result.analysis.candidates,
      triggeringAction: 'pull' as const,
    };
    if (this.messageRouter) {
      this.messageRouter.publishConflictResult(conflictPayload);
    } else {
      webview.postMessage({ type: 'CONFLICT_RESULT', payload: conflictPayload });
    }
    this.sendOperationResult(webview, 'EXECUTE_PULL', { success: false, message });
    this.notifyWarningAllWebviews(webview, message);
    return true;
  }

  /**
   * RUN_MERGE 사전 가드 — push/pull/create PR과 동일하게 실제 git merge 전에 충돌 후보만 분석합니다.
   * 후보가 있으면 git merge를 실행하지 않고 CONFLICT_RESULT로 검토 UI에 진입시킵니다.
   */
  private async guardLocalRunMergeConflict(
    payload: { source: string; target?: string },
    webview: vscode.Webview,
  ): Promise<boolean> {
    if (!this.mergeConflictGuardService || !this.messageRouter) {
      return false;
    }

    const status = await this.gitService.getStatus();
    const targetBranch = payload.target?.trim() || status.currentBranch;
    const result = await this.mergeConflictGuardService.guard({
      sourceBranch: payload.source,
      targetBranch,
      targetScope: 'local',
    });

    if (result.skipped || !result.hasConflicts) {
      return false;
    }

    const message =
      `로컬 브랜치(${payload.source})를 현재 브랜치(${targetBranch})에 병합하기 전에 ` +
      '충돌 가능성이 있습니다. AI 추천을 확인한 뒤 다시 시도해 주세요.';

    this.messageRouter.publishConflictResult({
      analysisId: result.analysis.analysisId,
      artifactPath: result.analysis.artifactPath,
      candidates: result.analysis.candidates,
      triggeringAction: 'merge',
      mergeSource: payload.source,
    });
    this.sendOperationResult(webview, 'RUN_MERGE', { success: false, message });
    this.notifyWarningAllWebviews(webview, message);
    return true;
  }

  private async handleRunMerge(
    payload: { source: string; target?: string; skipGuard?: boolean },
    webview: vscode.Webview,
  ): Promise<void> {
    this.sendLoading(webview, 'merge', true);
    try {
      if (!payload.skipGuard) {
        const blocked = await this.guardLocalRunMergeConflict(payload, webview);
        if (blocked) {
          return;
        }
      }

      if (payload.skipGuard) {
        await this.autoCommitAcceptedChanges();
        const status = await this.gitService.getStatus();
        gitcatLog(
          `[GitCat] RUN_MERGE retry: isMerging=${status.isMerging}, conflicted=[${status.conflicted.map((f) => f.path).join(',')}]`,
        );

        // 이미 git merge가 진행 중이거나 unmerged가 남아 있으면 git merge를 다시 실행하지 않음
        if (status.isMerging || status.conflicted.length > 0) {
          if (status.isMerging) {
            const finalized = await this.tryFinalizeInProgressMerge(
              webview,
              status,
              '병합이 완료되었습니다.',
            );
            if (finalized) {
              return;
            }
          }
          await this.publishMergeConflictForInProgressMerge(webview, payload, status);
          return;
        }

        await this.assertNoConflictMarkersBeforeFirstMerge(status);
        const snapshotPaths = this.collectPathsForMergeSnapshot(status);
        this.mergeWorkspaceSnapshot = await this.captureWorkspaceSnapshot(
          status.repoRoot,
          snapshotPaths,
        );
        gitcatLog(
          `[GitCat] RUN_MERGE retry: snapshot ${this.mergeWorkspaceSnapshot.size} file(s) before git merge`,
        );
        gitcatLog('[GitCat] RUN_MERGE retry: first actual git merge after conflict review');
      }

      const result = await this.gitService.runMerge(payload.source);
      if (result.success) {
        await this.completeRunMergeSuccess(webview, payload, result.stdout);
        return;
      }

      await this.handleRunMergeConflictFailure(webview, payload, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.notifyErrorAllWebviews(webview, message || 'Merge에 실패했습니다.');
    } finally {
      this.sendLoading(webview, 'merge', false);
    }
  }

  /**
   * MERGING 상태에서 마커 없는 unmerged 파일을 stage한 뒤 merge --continue.
   * 성공 시 true.
   */
  private async tryFinalizeInProgressMerge(
    webview: vscode.Webview,
    status: GitStatusResponse,
    successMessage: string,
  ): Promise<boolean> {
    if (!status.isMerging) {
      return false;
    }
    try {
      await this.handleMergeContinueAfterReview(webview, status, successMessage);
      return true;
    } catch (error) {
      gitcatLogWarn('[GitCat] tryFinalizeInProgressMerge 실패:', error);
      return false;
    }
  }

  /** 첫 git merge 실행 전 워킹트리에 충돌 마커가 없는지 확인 */
  private async assertNoConflictMarkersBeforeFirstMerge(status: GitStatusResponse): Promise<void> {
    const repoRoot = status.repoRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const pathsToCheck = [
      ...status.conflicted.map((f) => f.path),
      ...status.unstaged.map((f) => f.path),
      ...status.staged.map((f) => f.path),
    ];
    const uniquePaths = [...new Set(pathsToCheck)];
    const markerFiles = await this.findFilesWithConflictMarkers(repoRoot, uniquePaths);
    if (markerFiles.length > 0) {
      throw new Error(
        `다음 파일에 충돌 마커(<<<<<<, =======, >>>>>>>)가 남아있습니다: ${markerFiles.join(', ')}\n` +
          '직접 편집하여 충돌을 해소한 뒤 다시 시도해주세요.',
      );
    }
  }

  private async completeRunMergeSuccess(
    webview: vscode.Webview,
    payload: { source: string; target?: string },
    stdout?: string,
  ): Promise<void> {
    this.mergeWorkspaceSnapshot = null;
    const message = stdout || 'Merge completed.';
    this.sendOperationResult(webview, 'RUN_MERGE', { success: true, message });
    this.broadcastMergeComplete(webview, {
      status: 'completed',
      message,
      source: payload.source,
      target: payload.target,
      completedAt: new Date().toISOString(),
    });
    this.notifySuccessAllWebviews(webview, '병합이 완료되었습니다.');
    await this.handleRefreshStatus(webview);
  }

  /**
   * git merge 실패 후 처리.
   * MERGING이면 continue 시도 → 실패 시 git unmerged 경로 기준 CONFLICT_RESULT (예측 가드만으로 UI 초기화하지 않음).
   */
  private async handleRunMergeConflictFailure(
    webview: vscode.Webview,
    payload: { source: string; target?: string },
    result: { stderr?: string; conflictedFiles?: string[] },
  ): Promise<void> {
    const status = await this.gitService.getStatus();
    const gitConflictedPaths = [
      ...new Set([
        ...(result.conflictedFiles ?? []),
        ...status.conflicted.map((f) => f.path),
      ]),
    ];
    const failureMessage =
      result.stderr ||
      `병합 충돌이 발생했습니다: ${gitConflictedPaths.join(', ')}`;

    if (status.isMerging) {
      gitcatLog('[GitCat] merge failed while MERGING — try finalize then publish git unmerged paths');
      const finalized = await this.tryFinalizeInProgressMerge(
        webview,
        status,
        '병합이 완료되었습니다.',
      );
      if (finalized) {
        return;
      }

      await this.publishMergeConflictForInProgressMerge(webview, payload, status, gitConflictedPaths);
      this.sendOperationResult(webview, 'RUN_MERGE', { success: false, message: failureMessage });
      this.notifyWarningAllWebviews(
        webview,
        `병합 중 충돌이 남아 있습니다: ${gitConflictedPaths.join(', ')}. 표시된 파일을 해결한 뒤 Merge 다시 시도해 주세요.`,
      );
      await this.handleRefreshStatus(webview);
      return;
    }

    // MERGING이 아닌 실패(드묾) — 예측 가드 결과가 있으면 그대로 사용
    if (this.mergeConflictGuardService && this.messageRouter) {
      const targetBranch = payload.target?.trim() || status.currentBranch;
      const guardResult = await this.mergeConflictGuardService.guard({
        sourceBranch: payload.source,
        targetBranch,
        targetScope: 'local',
      });

      if (!guardResult.skipped && guardResult.hasConflicts) {
        const message = `로컬 브랜치(${payload.source}) 병합 중 충돌이 발생했습니다. AI 추천을 확인하고 해결 후 다시 시도해 주세요.`;
        this.messageRouter.publishConflictResult({
          analysisId: guardResult.analysis.analysisId,
          artifactPath: guardResult.analysis.artifactPath,
          candidates: guardResult.analysis.candidates,
          triggeringAction: 'merge',
          mergeSource: payload.source,
        });
        this.sendOperationResult(webview, 'RUN_MERGE', { success: false, message });
        this.notifyWarningAllWebviews(webview, message);
        await this.handleRefreshStatus(webview);
        return;
      }
    }

    this.sendOperationResult(webview, 'RUN_MERGE', {
      success: false,
      error: failureMessage,
    });
    this.broadcastMergeComplete(webview, {
      status: 'conflicted',
      message: failureMessage,
      source: payload.source,
      target: payload.target,
      conflictedFiles: gitConflictedPaths,
      completedAt: new Date().toISOString(),
    });
    this.notifyErrorAllWebviews(webview, failureMessage);
    await this.handleRefreshStatus(webview);
  }

  private async publishMergeConflictForInProgressMerge(
    webview: vscode.Webview,
    payload: { source: string; target?: string },
    status: GitStatusResponse,
    extraGitPaths?: string[],
  ): Promise<void> {
    const targetBranch = payload.target?.trim() || status.currentBranch;
    await this.publishInProgressMergeConflict(
      webview,
      {
        triggeringAction: 'merge',
        sourceBranch: payload.source,
        targetBranch,
        targetScope: 'local',
        mergeSource: payload.source,
      },
      status,
      extraGitPaths,
    );
  }

  /**
   * git merge/pull 진행 중 남은 충돌을 UI에 반영.
   * 예측 가드 후보 + git unmerged 경로를 합쳐 표시합니다.
   */
  private async publishInProgressMergeConflict(
    webview: vscode.Webview,
    options: {
      triggeringAction: 'merge' | 'pull';
      sourceBranch: string;
      targetBranch: string;
      targetScope: 'local' | 'remote';
      mergeSource?: string;
    },
    status: GitStatusResponse,
    extraGitPaths?: string[],
  ): Promise<void> {
    const gitPaths = [
      ...new Set([
        ...status.conflicted.map((f) => f.path),
        ...(extraGitPaths ?? []),
      ]),
    ];

    if (!this.messageRouter) {
      this.notifyErrorAllWebviews(
        webview,
        `병합 충돌 파일: ${gitPaths.join(', ')}`,
      );
      return;
    }

    let analysisId = `git_merge_${Date.now()}`;
    let artifactPath: string | null = null;
    let candidates: MergeConflictCandidateView[] = [];

    if (this.mergeConflictGuardService) {
      const guardResult = await this.mergeConflictGuardService.guard({
        sourceBranch: options.sourceBranch,
        targetBranch: options.targetBranch,
        targetScope: options.targetScope,
      });
      if (!guardResult.skipped && guardResult.hasConflicts) {
        analysisId = guardResult.analysis.analysisId;
        artifactPath = guardResult.analysis.artifactPath;
        candidates = [...guardResult.analysis.candidates];
      }
    }

    const covered = new Set(candidates.map((c) => c.filePath));
    const actionLabel = options.triggeringAction === 'pull' ? 'Pull' : 'Merge';
    for (const filePath of gitPaths) {
      if (covered.has(filePath)) {
        continue;
      }
      const candidateId = `git_unmerged_${createHash('sha1').update(filePath).digest('hex').slice(0, 12)}`;
      candidates.push({
        analysisId,
        candidateId,
        filePath,
        lineStart: 1,
        lineEnd: 1,
        severity: 'high',
        reason: `git ${options.triggeringAction} 실행 중 이 파일에서 실제 병합 충돌이 발생했습니다.`,
        suggestion: `AI 병합 초안으로 해결한 뒤 ${actionLabel} 다시 시도해 주세요.`,
        detectedBy: 'diff',
        riskLevel: 'high',
      });
    }

    const message =
      gitPaths.length > 0
        ? `${actionLabel} 중 해결이 필요한 파일: ${gitPaths.join(', ')}`
        : `${actionLabel} 중 충돌이 남아 있습니다. 해결 후 ${actionLabel} 다시 시도해 주세요.`;

    this.messageRouter.publishConflictResult({
      analysisId,
      artifactPath,
      candidates,
      triggeringAction: options.triggeringAction,
      mergeSource: options.mergeSource,
      preserveResolvedCandidates: true,
    });
    this.notifyWarningAllWebviews(webview, message);
  }

  private async handleMergeAbort(webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'merge', true);
    try {
      const result = await this.gitService.mergeAbort();
      this.sendOperationResult(webview, 'MERGE_ABORT', result);
      if (result.success) {
        webview.postMessage({
          type: 'MERGE_COMPLETE',
          payload: {
            merge: {
              status: 'aborted',
              message: result.message,
              completedAt: new Date().toISOString(),
            },
          },
        });
        this.sendNotification(webview, 'info', result.message ?? '병합이 취소되었습니다.');
      } else {
        this.sendError(webview, result.message ?? '병합 취소에 실패했습니다.');
      }
      await this.handleRefreshStatus(webview);
    } finally {
      this.sendLoading(webview, 'merge', false);
    }
  }

  private async handleMergeContinue(webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'merge', true);
    try {
      const result = await this.gitService.mergeContinue();
      this.sendOperationResult(webview, 'MERGE_CONTINUE', result);
      if (result.success) {
        this.sendNotification(webview, 'info', result.message ?? '병합이 계속 진행됩니다.');
        // merge continue 성공도 동일한 완료 projection으로 Webview에 알립니다.
        webview.postMessage({
          type: 'MERGE_COMPLETE',
          payload: {
            merge: {
              status: 'continued',
              message: result.message,
              completedAt: new Date().toISOString(),
            },
          },
        });
      } else {
        this.sendError(webview, result.message ?? '병합 계속 진행에 실패했습니다.');
      }
      await this.handleRefreshStatus(webview);
    } finally {
      this.sendLoading(webview, 'merge', false);
    }
  }

  // ─── Stash ────────────────────────────────────────────────────────────────

  private async handleGetStashList(webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'stash', true);
    try {
      const stashes = await this.gitService.stashList();
      webview.postMessage({ type: 'STASH_LIST', payload: { stashes } });
    } finally {
      this.sendLoading(webview, 'stash', false);
    }
  }

  private async handleStashSave(
    payload: { message?: string },
    webview: vscode.Webview,
  ): Promise<void> {
    this.sendLoading(webview, 'stash', true);
    try {
      const result = await this.gitService.stashSave(payload.message);
      this.sendOperationResult(webview, 'STASH_SAVE', result);
      if (result.success) {
        this.sendNotification(webview, 'info', result.message ?? 'Stash가 저장되었습니다.');
        await this.handleRefreshStatus(webview);
        await this.handleGetStashList(webview);
      } else {
        this.sendError(webview, result.message ?? 'Stash 저장에 실패했습니다.');
      }
    } finally {
      this.sendLoading(webview, 'stash', false);
    }
  }

  private async handleStashApply(
    payload: { ref?: string; stashRef?: string },
    webview: vscode.Webview,
  ): Promise<void> {
    this.sendLoading(webview, 'stash', true);
    try {
      const result = await this.gitService.stashApply(payload.ref ?? payload.stashRef);
      this.sendOperationResult(webview, 'STASH_APPLY', result);
      if (result.success) {
        this.sendNotification(webview, 'info', result.message ?? 'Stash가 적용되었습니다.');
        await this.handleRefreshStatus(webview);
      } else {
        this.sendError(webview, result.message ?? 'Stash 적용에 실패했습니다.');
      }
    } finally {
      this.sendLoading(webview, 'stash', false);
    }
  }

  private async handleStashPop(
    payload: { ref?: string; stashRef?: string },
    webview: vscode.Webview,
  ): Promise<void> {
    this.sendLoading(webview, 'stash', true);
    try {
      const result = await this.gitService.stashPop(payload.ref ?? payload.stashRef);
      this.sendOperationResult(webview, 'STASH_POP', result);
      if (result.success) {
        this.sendNotification(webview, 'info', result.message ?? 'Stash가 적용 및 제거되었습니다.');
        await this.handleRefreshStatus(webview);
        await this.handleGetStashList(webview);
      } else {
        this.sendError(webview, result.message ?? 'Stash pop에 실패했습니다.');
      }
    } finally {
      this.sendLoading(webview, 'stash', false);
    }
  }

  private async handleStashDrop(
    payload: { ref?: string; stashRef?: string },
    webview: vscode.Webview,
  ): Promise<void> {
    this.sendLoading(webview, 'stash', true);
    try {
      const result = await this.gitService.stashDrop(payload.ref ?? payload.stashRef);
      this.sendOperationResult(webview, 'STASH_DROP', result);
      if (result.success) {
        this.sendNotification(webview, 'info', result.message ?? 'Stash 항목이 삭제되었습니다.');
        await this.handleGetStashList(webview);
      } else {
        this.sendError(webview, result.message ?? 'Stash drop에 실패했습니다.');
      }
    } finally {
      this.sendLoading(webview, 'stash', false);
    }
  }

  // ─── Unstage ──────────────────────────────────────────────────────────────

  private async handleGitUnstage(
    payload: { filePaths: string[] },
    webview: vscode.Webview,
  ): Promise<void> {
    this.sendLoading(webview, 'stage', true);
    try {
      await this.gitService.unstageFiles(payload.filePaths);
      this.sendOperationResult(webview, 'GIT_UNSTAGE', { success: true });
      this.sendNotification(webview, 'info', `${payload.filePaths.length}개 파일이 unstage되었습니다.`);
      await this.handleRefreshStatus(webview);
    } finally {
      this.sendLoading(webview, 'stage', false);
    }
  }

  // ─── 로컬 브랜치 자동 정리 ────────────────────────────────────────────────

  private async handleGetBranchCleanupSettings(webview: vscode.Webview): Promise<void> {
    try {
      const settings = this.branchCleanupService.getSettings();
      webview.postMessage({
        type: 'BRANCH_CLEANUP_SETTINGS',
        payload: { settings },
      });
    } catch (err: any) {
      this.sendError(webview, err?.message ?? 'Failed to get branch cleanup settings.');
    }
  }

  private async handleSaveBranchCleanupSettings(
    payload: any,
    webview: vscode.Webview,
  ): Promise<void> {
    this.sendLoading(webview, 'branchCleanup', true);
    try {
      const { settings } = payload;
      await this.branchCleanupService.saveSettings(settings);
      this.sendNotification(webview, 'info', '브랜치 정리 설정이 저장되었습니다.');
      // 변경된 설정 다시 전송
      await this.handleGetBranchCleanupSettings(webview);
    } catch (err: any) {
      this.sendError(webview, err?.message ?? 'Failed to save branch cleanup settings.');
    } finally {
      this.sendLoading(webview, 'branchCleanup', false);
    }
  }

  private async handleGetBranchCleanupCandidates(webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'branchCleanup', true);
    try {
      const result = await this.branchCleanupService.getCandidates();
      webview.postMessage({
        type: 'BRANCH_CLEANUP_CANDIDATES',
        payload: { result },
      });
    } catch (err: any) {
      this.sendError(webview, err?.message ?? 'Failed to get branch cleanup candidates.');
    } finally {
      this.sendLoading(webview, 'branchCleanup', false);
    }
  }

  private async handleExecuteBranchCleanup(
    payload: { branchNames: string[] },
    webview: vscode.Webview,
  ): Promise<void> {
    this.sendLoading(webview, 'branchCleanup', true);
    try {
      const result = await this.branchCleanupService.executeCleanup(payload.branchNames);
      webview.postMessage({
        type: 'BRANCH_CLEANUP_RESULT',
        payload: { result },
      });
      this.sendNotification(
        webview,
        result.failedBranches.length === 0 ? 'info' : 'warning',
        result.summary
      );
      // 삭제 후 브랜치 목록과 상태 갱신
      await this.handleGetBranchList(webview);
    } catch (err: any) {
      this.sendError(webview, err?.message ?? 'Failed to execute branch cleanup.');
    } finally {
      this.sendLoading(webview, 'branchCleanup', false);
    }
  }

  // ─── 공통 응답 헬퍼 ──────────────────────────────────────────────────────

  private sendLoading(webview: vscode.Webview, target: string, loading: boolean): void {
    const message = { type: 'LOADING', payload: { target, loading } };
    if (target === 'merge' && this.messageRouter) {
      this.messageRouter.broadcast(message);
    } else {
      webview.postMessage(message);
    }
  }

  private broadcastMergeComplete(
    webview: vscode.Webview,
    merge: {
      status: 'completed' | 'continued' | 'conflicted' | 'aborted';
      message: string;
      source?: string;
      target?: string;
      conflictedFiles?: string[];
      completedAt?: string;
    },
  ): void {
    const message = { type: 'MERGE_COMPLETE', payload: { merge } };
    if (this.messageRouter) {
      this.messageRouter.broadcast(message);
    } else {
      webview.postMessage(message);
    }
  }

  private sendNotification(
    webview: vscode.Webview,
    type: 'info' | 'warning' | 'error',
    message: string,
  ): void {
    webview.postMessage({ type: 'NOTIFICATION', payload: { type, message } });
  }

  /** 사이드바·에디터 패널 등 모든 GitCat 웹뷰에 동일 경고를 띄울 때 */
  private notifyWarningAllWebviews(webview: vscode.Webview, message: string): void {
    if (this.messageRouter) {
      this.messageRouter.broadcast({ type: 'NOTIFICATION', payload: { type: 'warning', message } });
    } else {
      this.sendNotification(webview, 'warning', message);
    }
  }

  /** 모든 웹뷰에 에러를 broadcast — editor 패널의 retryError가 반드시 표시되도록 ERROR 타입으로 전파 */
  private notifyErrorAllWebviews(webview: vscode.Webview, message: string): void {
    if (this.messageRouter) {
      this.messageRouter.broadcast({ type: 'ERROR', payload: { code: 'GIT_OPERATION_FAILED', message } });
    } else {
      this.sendError(webview, message);
    }
  }

  /** 모든 웹뷰에 성공 알림을 broadcast */
  private notifySuccessAllWebviews(webview: vscode.Webview, message: string): void {
    if (this.messageRouter) {
      this.messageRouter.broadcast({ type: 'NOTIFICATION', payload: { type: 'info', message } });
    } else {
      this.sendNotification(webview, 'info', message);
    }
  }

  private sendOperationResult(
    webview: vscode.Webview,
    operation: string,
    result: { success: boolean; message?: string; error?: string },
  ): void {
    webview.postMessage({
      type: 'GIT_OPERATION_RESULT',
      payload: { operation, result },
    });
  }

  private sendError(webview: vscode.Webview, message: string): void {
    webview.postMessage({
      type: 'ERROR',
      payload: { code: 'GIT_OPERATION_FAILED', message },
    });
  }
}
