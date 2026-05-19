import * as vscode from 'vscode';
import { GitService, GitStatusResponse } from './GitService';
import { MessageRouter } from '../../core/MessageRouter';

const DEFAULT_POLL_INTERVAL_MS = 10_000;

type RefreshOptions = {
  force: boolean;
  fetchRemote?: boolean;
  /** 저장 파일이 속한 워크스페이스 폴더 — 워크트리/멀티루트 대응 */
  cwd?: string;
};

/**
 * Polls Git state and pushes status heartbeats to active Webviews.
 */
export class GitStatusRefreshController implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private lastSignature: string | undefined;
  private isRefreshing = false;
  private pendingRefresh: RefreshOptions | null = null;

  constructor(
    private readonly gitService: GitService,
    private readonly messageRouter: MessageRouter,
    private readonly intervalMs = DEFAULT_POLL_INTERVAL_MS,
  ) {}

  start(): void {
    void this.refresh({ force: true, fetchRemote: false });
    this.timer = setInterval(() => {
      void this.refresh({ force: false, fetchRemote: false });
    }, this.intervalMs);
  }

  async refresh(options: RefreshOptions): Promise<void> {
    if (this.isRefreshing) {
      this.pendingRefresh = this.mergePending(this.pendingRefresh, options);
      return;
    }

    this.isRefreshing = true;
    try {
      if (options.fetchRemote === true) {
        await this.gitService.fetchAllPrune();
      }
      const [status, branches] = await Promise.all([
        this.gitService.getStatusWithWorktrees({ fetchRemote: false, cwd: options.cwd }),
        this.gitService.getBranches(),
      ]);
      const signature = this.createSignature(status, branches);
      const hasChanged = options.force || signature !== this.lastSignature;

      this.lastSignature = signature;

      const summary = await this.gitService.buildStatusSummaryFromStatus(status, options.cwd);

      this.messageRouter.broadcast({
        type: 'GIT_STATUS_UPDATED',
        payload: { status },
      });
      this.messageRouter.broadcast({
        type: 'GIT_STATUS_SUMMARY',
        payload: { summary },
      });

      if (!hasChanged) {
        return;
      }

      this.messageRouter.broadcast({
        type: 'BRANCH_LIST',
        payload: { branches },
      });
      if (status.worktrees) {
        this.messageRouter.broadcast({
          type: 'WORKTREE_LIST',
          payload: { worktrees: status.worktrees },
        });
      }
    } catch (error) {
      console.warn('[GitCat] Git status polling failed:', error);
    } finally {
      this.isRefreshing = false;
      const pending = this.pendingRefresh;
      this.pendingRefresh = null;
      if (pending) {
        void this.refresh(pending);
      }
    }
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private mergePending(
    current: RefreshOptions | null,
    incoming: RefreshOptions,
  ): RefreshOptions {
    if (!current) {
      return incoming;
    }
    return {
      force: current.force || incoming.force,
      fetchRemote: current.fetchRemote === true || incoming.fetchRemote === true,
      cwd: incoming.cwd ?? current.cwd,
    };
  }

  private createSignature(status: GitStatusResponse, branches: unknown): string {
    return JSON.stringify({
      status,
      branches,
    });
  }
}
