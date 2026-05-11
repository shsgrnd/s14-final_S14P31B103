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

import * as vscode from 'vscode';
import { GitService } from './GitService';
import { BranchCleanupService } from './BranchCleanupService';

export class GitMessageHandler {
  constructor(
    private readonly gitService: GitService,
    private readonly branchCleanupService: BranchCleanupService
  ) {}

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
        await this.handlePush(webview);
        return true;

      case 'EXECUTE_PULL':
        await this.handlePull(webview);
        return true;

      // ─── Merge ───────────────────────────────────────────────────────────
      case 'RUN_MERGE':
        await this.handleRunMerge(payload, webview);
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
      const [status, branches] = await Promise.all([
        this.gitService.getStatusWithWorktrees(),
        this.gitService.getBranches(),
      ]);
      webview.postMessage({
        type: 'GIT_STATUS_UPDATED',
        payload: { status },
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

  private async handlePush(webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'push', true);
    try {
      // Push 전 가드: Push할 커밋이 있는지 확인한다.
      try {
        const branches = await this.gitService.getBranches();
        const currentBranch = branches.find((b) => b.isCurrent);

        // 원격 트래킹 브랜치(upstream)가 설정되어 있을 때만 "Push할 커밋 유무"를 검증한다.
        // 트래킹 브랜치가 없다면 신규 브랜치의 첫 푸시이므로 정상 진행시켜야 한다.
        if (currentBranch && currentBranch.trackingBranch) {
          const unpushed = await this.gitService.getUnpushedFiles();
          if (unpushed.length === 0) {
            const message = 'Push할 새로운 커밋이 없습니다. (이미 원격 저장소와 최신 상태입니다)';
            this.sendOperationResult(webview, 'GIT_PUSH', { success: false, message });
            this.sendNotification(webview, 'info', message);
            return;
          }
        }
      } catch (error) {
        console.warn('[GitCat] Push 가드 검증 중 예외 발생:', error);
      }

      const result = await this.gitService.push();
      this.sendOperationResult(webview, 'GIT_PUSH', result);
      if (result.success) {
        this.sendNotification(webview, 'info', result.message ?? 'Push가 완료되었습니다.');
        await this.handleRefreshStatus(webview);
      } else {
        this.sendError(webview, result.message ?? 'Push에 실패했습니다.');
      }
    } finally {
      this.sendLoading(webview, 'push', false);
    }
  }

  private async handlePull(webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'pull', true);
    try {
      const result = await this.gitService.pull();
      this.sendOperationResult(webview, 'EXECUTE_PULL', result);
      if (result.success) {
        this.sendNotification(webview, 'info', result.message ?? 'Pull이 완료되었습니다.');
        await this.handleRefreshStatus(webview);
      } else {
        this.sendError(webview, result.message ?? 'Pull에 실패했습니다.');
      }
    } finally {
      this.sendLoading(webview, 'pull', false);
    }
  }

  private async handleRunMerge(
    payload: { source: string; target?: string },
    webview: vscode.Webview,
  ): Promise<void> {
    this.sendLoading(webview, 'merge', true);
    try {
      const result = await this.gitService.runMerge(payload.source);
      this.sendOperationResult(webview, 'RUN_MERGE', {
        success: result.success,
        message: result.success ? result.stdout : undefined,
        error: result.success ? undefined : result.stderr,
      });
      if (result.success) {
        webview.postMessage({ type: 'MERGE_COMPLETE', payload: {} });
        this.sendNotification(webview, 'info', '병합이 완료되었습니다.');
        await this.handleRefreshStatus(webview);
      } else {
        // 충돌 발생 — 프론트에 상태 전달 (세이프티 레이어는 3단계에서)
        this.sendError(
          webview,
          `병합 충돌이 발생했습니다: ${result.conflictedFiles?.join(', ') ?? ''}`,
        );
        await this.handleRefreshStatus(webview);
      }
    } finally {
      this.sendLoading(webview, 'merge', false);
    }
  }

  private async handleMergeAbort(webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'merge', true);
    try {
      const result = await this.gitService.mergeAbort();
      this.sendOperationResult(webview, 'MERGE_ABORT', result);
      if (result.success) {
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
        webview.postMessage({ type: 'MERGE_COMPLETE', payload: {} });
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
    webview.postMessage({ type: 'LOADING', payload: { target, loading } });
  }

  private sendNotification(
    webview: vscode.Webview,
    type: 'info' | 'warning' | 'error',
    message: string,
  ): void {
    webview.postMessage({ type: 'NOTIFICATION', payload: { type, message } });
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
