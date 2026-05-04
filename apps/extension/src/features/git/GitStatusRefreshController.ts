import * as vscode from 'vscode';
import { GitService, GitStatusResponse } from './GitService';
import { MessageRouter } from '../../core/MessageRouter';

const DEFAULT_POLL_INTERVAL_MS = 20_000;

/**
 * Polls Git state and pushes status heartbeats to active Webviews.
 */
export class GitStatusRefreshController implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private lastSignature: string | undefined;
  private isRefreshing = false;

  constructor(
    private readonly gitService: GitService,
    private readonly messageRouter: MessageRouter,
    private readonly intervalMs = DEFAULT_POLL_INTERVAL_MS,
  ) {}

  start(): void {
    void this.refresh({ force: true });
    this.timer = setInterval(() => {
      void this.refresh({ force: false });
    }, this.intervalMs);
  }

  async refresh(options: { force: boolean }): Promise<void> {
    if (this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;
    try {
      await this.gitService.fetchAllPrune();
      const [status, branches] = await Promise.all([
        this.gitService.getStatusWithWorktrees(),
        this.gitService.getBranches(),
      ]);
      const signature = this.createSignature(status, branches);
      const hasChanged = options.force || signature !== this.lastSignature;

      this.lastSignature = signature;
      this.messageRouter.broadcast({
        type: 'GIT_STATUS_UPDATED',
        payload: { status },
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
    }
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private createSignature(status: GitStatusResponse, branches: unknown): string {
    return JSON.stringify({
      status,
      branches,
    });
  }
}
