import type { MergeConflictAnalysisResult } from './MergeConflictAnalysisService';
import { MergeConflictAnalysisService } from './MergeConflictAnalysisService';
import type { GitService } from '../git/GitService';

export interface MergeConflictGuardRunOptions {
  sourceBranch?: string;
  targetBranch?: string | null;
  targetScope?: 'remote' | 'local';
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
  private static readonly FALLBACK_TARGET_NAMES = ['main', 'master', 'develop'] as const;

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

  /** PR 기본 base 미설정 시 main/master/develop 로컬 브랜치를 push 가드 target으로 사용 */
  async guardDefaultTargetWithFallback(sourceBranch?: string): Promise<MergeConflictGuardResult> {
    const configured = this.getDefaultTargetBranch();
    const targetBranch = configured ?? (await this.inferFallbackTargetBranch());
    return this.guard({
      sourceBranch,
      targetBranch,
    });
  }

  private async inferFallbackTargetBranch(): Promise<string | null> {
    const branches = await this.gitService.getBranches();
    const localNames = new Set(branches.filter((b) => !b.isRemote).map((b) => b.name));
    for (const name of MergeConflictGuardService.FALLBACK_TARGET_NAMES) {
      if (localNames.has(name)) {
        return name;
      }
    }
    return null;
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

    // tracking branch 비교는 로컬 vs origin/로컬 이므로
    // guard()의 sameBranch 체크를 우회하고 분석 서비스를 직접 호출한다.
    const sourceBranch = trackingState.sourceBranch;
    const targetBranch = this.toTargetBranch(trackingState.trackingBranch, 'remote')!;

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

  async guard(options: MergeConflictGuardRunOptions): Promise<MergeConflictGuardResult> {
    await this.gitService.fetchAllPrune();

    const status = await this.gitService.getStatus();
    const sourceBranch = options.sourceBranch?.trim() || status.currentBranch;
    const targetBranch = this.toTargetBranch(options.targetBranch, options.targetScope ?? 'remote');

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

  private toTargetBranch(
    targetBranch: string | null | undefined,
    scope: 'remote' | 'local',
  ): string | null {
    const trimmed = targetBranch?.trim();
    if (!trimmed) {
      return null;
    }

    // 로컬 merge는 현재 로컬 브랜치를 target으로 비교해야 하므로 origin/ 접두사를 붙이지 않습니다.
    if (scope === 'local') {
      return trimmed;
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
