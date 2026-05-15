import type { MergeConflictAnalysisResult } from './MergeConflictAnalysisService';
import { MergeConflictAnalysisService } from './MergeConflictAnalysisService';
import type { GitService } from '../git/GitService';

export interface MergeConflictGuardRunOptions {
  sourceBranch?: string;
  targetBranch?: string | null;
}

export type MergeConflictGuardResult =
  | {
      skipped: true;
      reason: 'missing-target' | 'same-branch' | 'no-remote-changes';
      sourceBranch: string;
      targetBranch: string | null;
    }
  | {
      skipped: false;
      sourceBranch: string;
      targetBranch: string;
      analysis: MergeConflictAnalysisResult;
      hasConflicts: boolean;
    };

export type MergeTrackingBranchState =
  | {
      hasTrackingBranch: false;
      sourceBranch: string;
      trackingBranch: null;
      ahead: number;
      behind: number;
    }
  | {
      hasTrackingBranch: true;
      sourceBranch: string;
      trackingBranch: string;
      ahead: number;
      behind: number;
    };

/**
 * push/PR 생성 전에 원격 target 브랜치 기준 병합 충돌 가능성을 확인합니다.
 *
 * 실제 merge는 실행하지 않고, 기존 충돌 분석 서비스를 재사용해 진행 차단 여부만 판단합니다.
 */
export class MergeConflictGuardService {
  constructor(
    private readonly gitService: GitService,
    private readonly analysisService: MergeConflictAnalysisService,
    private readonly getDefaultTargetBranch: () => string | null,
  ) {}

  async guardDefaultTarget(sourceBranch?: string): Promise<MergeConflictGuardResult> {
    return this.guard({
      sourceBranch,
      targetBranch: this.getDefaultTargetBranch(),
    });
  }

  async getCurrentTrackingBranchState(): Promise<MergeTrackingBranchState> {
    await this.gitService.fetchAllPrune();

    const [status, branches] = await Promise.all([
      this.gitService.getStatus(),
      this.gitService.getBranches(),
    ]);
    const currentBranch = branches.find((branch) => branch.isCurrent);
    const trackingBranch = currentBranch?.trackingBranch ?? null;

    if (!trackingBranch) {
      return {
        hasTrackingBranch: false,
        sourceBranch: status.currentBranch,
        trackingBranch: null,
        ahead: status.ahead,
        behind: status.behind,
      };
    }

    return {
      hasTrackingBranch: true,
      sourceBranch: status.currentBranch,
      trackingBranch,
      ahead: status.ahead,
      behind: status.behind,
    };
  }

  async guardTrackingBranch(): Promise<MergeConflictGuardResult> {
    const trackingState = await this.getCurrentTrackingBranchState();

    if (!trackingState.hasTrackingBranch) {
      return {
        skipped: true,
        reason: 'missing-target',
        sourceBranch: trackingState.sourceBranch,
        targetBranch: null,
      };
    }

    if (trackingState.behind <= 0) {
      return {
        skipped: true,
        reason: 'no-remote-changes',
        sourceBranch: trackingState.sourceBranch,
        targetBranch: trackingState.trackingBranch,
      };
    }

    return this.guard({
      sourceBranch: trackingState.sourceBranch,
      targetBranch: trackingState.trackingBranch,
    });
  }

  async guard(options: MergeConflictGuardRunOptions): Promise<MergeConflictGuardResult> {
    await this.gitService.fetchAllPrune();

    const status = await this.gitService.getStatus();
    const sourceBranch = options.sourceBranch?.trim() || status.currentBranch;
    const targetBranch = this.toRemoteTargetBranch(options.targetBranch);

    if (!targetBranch) {
      return {
        skipped: true,
        reason: 'missing-target',
        sourceBranch,
        targetBranch: null,
      };
    }

    if (this.sameBranch(sourceBranch, targetBranch)) {
      return {
        skipped: true,
        reason: 'same-branch',
        sourceBranch,
        targetBranch,
      };
    }

    const analysis = await this.analysisService.analyze({
      source: sourceBranch,
      target: targetBranch,
    });

    return {
      skipped: false,
      sourceBranch,
      targetBranch,
      analysis,
      hasConflicts: analysis.candidates.length > 0,
    };
  }

  private toRemoteTargetBranch(targetBranch?: string | null): string | null {
    const trimmed = targetBranch?.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith('origin/')) {
      return trimmed;
    }

    return `origin/${trimmed}`;
  }

  private sameBranch(sourceBranch: string, targetBranch: string): boolean {
    return sourceBranch === targetBranch || `origin/${sourceBranch}` === targetBranch;
  }
}
