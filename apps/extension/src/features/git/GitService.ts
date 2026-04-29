/**
 * GitService — Extension Host Git 비즈니스 서비스
 *
 * IGitClient(port)를 주입받아 Git 작업을 수행하고,
 * Webview 응답용 DTO로 변환해 반환한다.
 *
 * MessageRouter는 이 서비스만 호출하며,
 * simple-git / CLI 세부 사항은 알 필요 없다.
 */

import type { IGitClient, BranchInfo, LogEntry, MergeResult } from '@gitcat/git-core';

// ─── Webview 응답용 DTO ───────────────────────────────────────────────────────

/**
 * GIT_STATUS_UPDATED payload에 담길 Git 상태 응답
 * (OutboundPayloadSchemaMap.GIT_STATUS_UPDATED.status 에 매핑)
 */
export interface GitStatusResponse {
  branch: string;
  currentBranch: string;
  isDetachedHead: boolean;
  ahead: number;
  behind: number;
  staged: Array<{ path: string; index: string; working_dir: string }>;
  unstaged: Array<{ path: string; index: string; working_dir: string }>;
  untracked: string[];
  conflicted: string[];
  isMergeInProgress: boolean;
  isMerging: boolean;
  isRebasing: boolean;
}

/**
 * BRANCH_LIST payload의 브랜치 항목
 * (shared-types BranchSchema 와 호환)
 */
export interface BranchInfoResponse {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  trackingBranch?: string;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  lastActivity: string;
  isMerged?: boolean;
  /** UI 표시용 상태 레이블 */
  status: 'active' | 'merged' | 'stale' | 'protected';
}

/** Stash 목록 항목 */
export interface StashEntryResponse {
  index: number;
  ref: string;
  message: string;
  branch: string;
  date: string;
}

/** Git log 항목 */
export interface LogEntryResponse {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  body?: string;
}

/** Git 명령 실행 결과 */
export interface GitCommandResult {
  success: boolean;
  message?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class GitService {
  constructor(private readonly gitClient: IGitClient) {}

  // ─── Status & Branch ─────────────────────────────────────────────────────

  async getStatus(): Promise<GitStatusResponse> {
    const status = await this.gitClient.getStatus();
    return {
      branch: status.currentBranch,
      currentBranch: status.currentBranch,
      isDetachedHead: status.isDetachedHead,
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged,
      unstaged: status.unstaged,
      untracked: status.untracked,
      conflicted: status.conflicted,
      isMergeInProgress: status.isMerging,
      isMerging: status.isMerging,
      isRebasing: status.isRebasing,
    };
  }

  async getBranches(): Promise<BranchInfoResponse[]> {
    const branches = await this.gitClient.getBranches();
    return branches.map((b) => ({
      name: b.name,
      isCurrent: b.isCurrent,
      isRemote: b.isRemote,
      trackingBranch: b.trackingBranch,
      lastCommitHash: b.lastCommitHash,
      lastCommitMessage: b.lastCommitMessage,
      lastActivity: b.lastCommitDate ?? '',
      isMerged: b.isMerged,
      status: this.toBranchStatus(b),
    }));
  }

  private toBranchStatus(b: BranchInfo): BranchInfoResponse['status'] {
    if (b.isCurrent) return 'active';
    if (this.isProtectedBranch(b.name)) return 'protected';
    if (b.isMerged) return 'merged';
    return 'stale';
  }

  private isProtectedBranch(name: string): boolean {
    return ['main', 'master', 'develop', 'dev'].includes(name);
  }

  // ─── Stage / Unstage ─────────────────────────────────────────────────────

  async stageFiles(filePaths: string[]): Promise<GitCommandResult> {
    await this.gitClient.stageFiles(filePaths);
    return { success: true };
  }

  async stageAll(): Promise<GitCommandResult> {
    await this.gitClient.stageAll();
    return { success: true };
  }

  async unstageFiles(filePaths: string[]): Promise<GitCommandResult> {
    await this.gitClient.unstageFiles(filePaths);
    return { success: true };
  }

  // ─── Branch Operations ───────────────────────────────────────────────────

  /**
   * 브랜치 생성 및 전환 (APPLY_BRANCH 메시지 처리)
   * - 브랜치가 없으면 생성 후 전환, 있으면 전환만
   */
  async applyBranch(name: string): Promise<GitCommandResult> {
    const branches = await this.gitClient.getBranches();
    const exists = branches.some((b) => b.name === name);
    if (exists) {
      await this.gitClient.checkoutBranch(name);
    } else {
      await this.gitClient.createAndCheckoutBranch(name);
    }
    return { success: true, message: `브랜치 "${name}"으로 전환했습니다.` };
  }

  async checkoutBranch(name: string): Promise<GitCommandResult> {
    await this.gitClient.checkoutBranch(name);
    return { success: true, message: `브랜치 "${name}"으로 전환했습니다.` };
  }

  async createBranch(name: string): Promise<GitCommandResult> {
    await this.gitClient.createBranch(name);
    return { success: true, message: `브랜치 "${name}"이 생성되었습니다.` };
  }

  async deleteBranches(names: string[], force: boolean): Promise<GitCommandResult> {
    const errors: string[] = [];
    const branches = await this.gitClient.getBranches();
    const branchMap = new Map(branches.map((branch) => [branch.name, branch]));

    for (const name of names) {
      try {
        const branch = branchMap.get(name);
        if (branch?.isCurrent) {
          errors.push(`${name}: cannot delete the currently checked out branch`);
          continue;
        }
        if (this.isProtectedBranch(name)) {
          errors.push(`${name}: protected branch`);
          continue;
        }

        await this.gitClient.deleteBranch(name, force);
      } catch (err: any) {
        errors.push(`${name}: ${err.message}`);
      }
    }
    if (errors.length > 0) {
      return { success: false, message: errors.join('\n') };
    }
    return { success: true, message: `${names.length}개 브랜치가 삭제되었습니다.` };
  }

  // ─── Commit / Push / Pull ────────────────────────────────────────────────

  async runCommit(message: string, body?: string): Promise<GitCommandResult> {
    await this.gitClient.runCommit(message, body);
    return { success: true, message: '커밋이 완료되었습니다.' };
  }

  async push(): Promise<GitCommandResult> {
    await this.gitClient.push();
    return { success: true, message: 'Push가 완료되었습니다.' };
  }

  async pull(): Promise<GitCommandResult> {
    await this.gitClient.pull();
    return { success: true, message: 'Pull이 완료되었습니다.' };
  }

  // ─── Stash ───────────────────────────────────────────────────────────────

  async stashList(): Promise<StashEntryResponse[]> {
    return this.gitClient.stashList();
  }

  async stashSave(message?: string): Promise<GitCommandResult> {
    await this.gitClient.stashSave(message);
    return { success: true, message: 'Stash가 저장되었습니다.' };
  }

  async stashApply(ref?: string): Promise<GitCommandResult> {
    await this.gitClient.stashApply(ref);
    return { success: true, message: 'Stash가 적용되었습니다.' };
  }

  async stashPop(ref?: string): Promise<GitCommandResult> {
    await this.gitClient.stashPop(ref);
    return { success: true, message: 'Stash가 적용 및 제거되었습니다.' };
  }

  async stashDrop(ref?: string): Promise<GitCommandResult> {
    await this.gitClient.stashDrop(ref);
    return { success: true, message: 'Stash 항목이 삭제되었습니다.' };
  }

  // ─── Merge ───────────────────────────────────────────────────────────────

  async runMerge(source: string): Promise<MergeResult> {
    return this.gitClient.runMerge(source);
  }

  async mergeContinue(): Promise<GitCommandResult> {
    await this.gitClient.runMergeContinue();
    return { success: true, message: '병합이 계속 진행됩니다.' };
  }

  async mergeAbort(): Promise<GitCommandResult> {
    await this.gitClient.runMergeAbort();
    return { success: true, message: '병합이 취소되었습니다.' };
  }

  // ─── AI 추천 입력 수집 (2단계 준비용) ────────────────────────────────────

  /**
   * AI 커밋 추천에 필요한 staged diff 수집
   * (2단계에서 RECOMMEND_COMMIT 핸들러가 이 메서드를 호출)
   */
  async getStagedDiff(): Promise<string> {
    return this.gitClient.getStagedDiff();
  }

  /**
   * AI PR 추천에 필요한 브랜치 간 diff 수집
   */
  async getDiff(base: string, branch: string) {
    return this.gitClient.getDiff(base, branch);
  }

  /**
   * AI PR 추천에 필요한 최근 커밋 로그 수집
   */
  async getLog(limit?: number): Promise<LogEntryResponse[]> {
    const entries = await this.gitClient.getLog(limit);
    return entries.map((e) => ({
      hash: e.hash,
      shortHash: e.shortHash,
      message: e.message,
      author: e.author,
      date: e.date,
      body: e.body,
    }));
  }

  /**
   * 두 브랜치의 공통 조상 커밋 해시 반환 (ConflictAnalyzer 입력용)
   */
  async getMergeBase(source: string, target: string): Promise<string> {
    return this.gitClient.getMergeBase(source, target);
  }

  /** 병합 완료 브랜치 목록 (브랜치 정리 기능용) */
  async getMergedBranches(): Promise<string[]> {
    return this.gitClient.getMergedBranches();
  }
}
