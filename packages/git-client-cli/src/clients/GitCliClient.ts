/**
 * GitCliClient — simple-git 기반 IGitClient 구현체
 *
 * 외부 의존성: simple-git (^3.22.0)
 *
 * 비즈니스 로직 없이 순수 Git CLI 래핑만 담당하며,
 * 에러는 GitError로 래핑해서 throw 한다.
 */

import simpleGit, { SimpleGit, SimpleGitOptions, BranchSummary } from 'simple-git';
// ⚠️  @gitcat/git-core는 pnpm workspace 심볼릭 링크로 연결됩니다.
// 상대 경로(../../git-core/src)로 변경하면 빌드 에러가 발생합니다.
// 올바른 경로: node_modules/@gitcat/git-core → packages/git-core
import type {
  IGitClient,
  GitStatus,
  BranchInfo,
  DiffResult,
  LogEntry,
  StashEntry,
  WorktreeInfo,
  MergeResult,
  FileStatusEntry,
} from '@gitcat/git-core';
import { GitError } from '@gitcat/git-core';

export class GitCliClient implements IGitClient {
  private readonly git: SimpleGit;

  constructor(private readonly repoPath: string) {
    const options: Partial<SimpleGitOptions> = {
      baseDir: repoPath,
      binary: 'git',
      maxConcurrentProcesses: 4,
    };
    this.git = simpleGit(options);
  }

  // ─── Query ──────────────────────────────────────────────────────────────

  async getStatus(): Promise<GitStatus> {
    const [status, branchResult] = await Promise.all([
      this.git.status(),
      this.git.branch(['-v', '--no-abbrev']),
    ]);

    const mapEntry = (item: { path: string; index: string; working_dir: string }): FileStatusEntry => ({
      path: item.path,
      index: item.index,
      working_dir: item.working_dir,
    });

    const isMerging = await this.fileExists('.git/MERGE_HEAD');
    const isRebasing = await this.fileExists('.git/rebase-merge') || await this.fileExists('.git/rebase-apply');

    return {
      currentBranch: status.current ?? 'HEAD',
      isDetachedHead: status.detached,
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged.map((p) => ({ path: p, index: 'M', working_dir: ' ' })),
      unstaged: status.modified.map((p) => ({ path: p, index: ' ', working_dir: 'M' })),
      untracked: status.not_added,
      conflicted: status.conflicted,
      isMerging,
      isRebasing,
    };
  }

  async getBranches(): Promise<BranchInfo[]> {
    const summary: BranchSummary = await this.git.branchLocal();
    const mergedRaw = await this.git.raw(['branch', '--merged']).catch(() => '');
    const mergedSet = new Set(
      mergedRaw
        .split('\n')
        .map((l) => l.trim().replace(/^\*\s*/, ''))
        .filter(Boolean),
    );

    return Object.entries(summary.branches).map(([name, b]) => ({
      name,
      isCurrent: b.current,
      isRemote: false,
      lastCommitHash: b.commit,
      lastCommitMessage: b.label,
      isMerged: mergedSet.has(name),
    }));
  }

  async getMergedBranches(): Promise<string[]> {
    const raw = await this.git.raw(['branch', '--merged']);
    return raw
      .split('\n')
      .map((l) => l.trim().replace(/^\*\s*/, ''))
      .filter(Boolean);
  }

  async getStagedDiff(): Promise<string> {
    return this.git.diff(['--staged']);
  }

  async getDiff(base: string, branch: string): Promise<DiffResult[]> {
    const raw = await this.git.diff([`${base}...${branch}`, '--name-status', '--diff-filter=ACDMRT']);
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('\t');
        const status = parts[0].charAt(0) as DiffResult['status'];
        const filePath = parts[parts.length - 1];
        const oldPath = parts.length === 3 ? parts[1] : undefined;
        return { filePath, status, additions: 0, deletions: 0, oldPath };
      });
  }

  async getMergeBase(source: string, target: string): Promise<string> {
    const result = await this.git.raw(['merge-base', source, target]);
    return result.trim();
  }

  async getWorktrees(): Promise<WorktreeInfo[]> {
    const raw = await this.git.raw(['worktree', 'list', '--porcelain']);
    return parseWorktreeList(raw);
  }

  async getLog(limit = 20): Promise<LogEntry[]> {
    const format = [
      '%H',   // hash
      '%h',   // shortHash
      '%s',   // subject
      '%an',  // author
      '%ae',  // authorEmail
      '%aI',  // date (ISO 8601)
      '%b',   // body
    ].join('%x00');

    const raw = await this.git.raw([
      'log',
      `-${limit}`,
      `--format=${format}%x01`,
    ]);

    return raw
      .split('\x01')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const parts = entry.split('\x00');
        return {
          hash: parts[0] ?? '',
          shortHash: parts[1] ?? '',
          message: parts[2] ?? '',
          author: parts[3] ?? '',
          authorEmail: parts[4] ?? '',
          date: parts[5] ?? '',
          body: parts[6]?.trim() || undefined,
        };
      });
  }

  // ─── Stage / Unstage ────────────────────────────────────────────────────

  async stageFiles(filePaths: string[]): Promise<void> {
    await this.git.add(filePaths);
  }

  async stageAll(): Promise<void> {
    await this.git.add('.');
  }

  async unstageFiles(filePaths: string[]): Promise<void> {
    await this.git.raw(['restore', '--staged', ...filePaths]);
  }

  // ─── Branch ─────────────────────────────────────────────────────────────

  async createBranch(name: string): Promise<void> {
    await this.git.branch([name]);
  }

  async checkoutBranch(name: string): Promise<void> {
    await this.git.checkout(name);
  }

  async createAndCheckoutBranch(name: string): Promise<void> {
    await this.git.checkoutBranch(name, 'HEAD');
  }

  async deleteBranch(name: string, force = false): Promise<void> {
    await this.git.deleteLocalBranch(name, force);
  }

  // ─── Commit / Push / Pull ────────────────────────────────────────────────

  async runCommit(message: string, body?: string): Promise<void> {
    const fullMessage = body ? `${message}\n\n${body}` : message;
    await this.git.commit(fullMessage);
  }

  async push(remote = 'origin', branch?: string): Promise<void> {
    const status = await this.git.status();
    const targetBranch = branch ?? status.current ?? '';
    await this.git.push(remote, targetBranch, ['--set-upstream']);
  }

  async pull(remote = 'origin', branch?: string): Promise<void> {
    const status = await this.git.status();
    const targetBranch = branch ?? status.current ?? '';
    await this.git.pull(remote, targetBranch);
  }

  // ─── Stash ──────────────────────────────────────────────────────────────

  async stashList(): Promise<StashEntry[]> {
    const raw = await this.git.raw([
      'stash',
      'list',
      '--format=%gd%x00%s%x00%ai%x00%gd',
    ]);
    if (!raw.trim()) return [];

    return raw
      .split('\n')
      .filter(Boolean)
      .map((line, idx) => {
        const parts = line.split('\x00');
        const ref = parts[0] ?? `stash@{${idx}}`;
        const fullMsg = parts[1] ?? '';
        const date = parts[2] ?? '';
        // "WIP on branch: message" または "On branch: message"
        const branchMatch = fullMsg.match(/(?:WIP on|On)\s+([^:]+)/);
        const branch = branchMatch?.[1] ?? '';
        return {
          index: idx,
          ref,
          message: fullMsg,
          branch,
          date,
        };
      });
  }

  async stashSave(message?: string): Promise<void> {
    const args: string[] = ['stash', 'push'];
    if (message) args.push('-m', message);
    await this.git.raw(args);
  }

  async stashApply(ref?: string): Promise<void> {
    const args: string[] = ['stash', 'apply'];
    if (ref) args.push(ref);
    await this.git.raw(args);
  }

  async stashPop(ref?: string): Promise<void> {
    const args: string[] = ['stash', 'pop'];
    if (ref) args.push(ref);
    await this.git.raw(args);
  }

  async stashDrop(ref?: string): Promise<void> {
    const args: string[] = ['stash', 'drop'];
    if (ref) args.push(ref);
    await this.git.raw(args);
  }

  // ─── Merge ──────────────────────────────────────────────────────────────

  async runMerge(source: string, _target?: string): Promise<MergeResult> {
    try {
      const result = await this.git.merge([source]);
      return {
        success: true,
        mergeCommit: result.result === 'success' ? undefined : undefined,
        stdout: String(result),
        stderr: '',
      };
    } catch (err: any) {
      const status = await this.git.status();
      return {
        success: false,
        conflictedFiles: status.conflicted,
        stdout: '',
        stderr: err?.message ?? String(err),
      };
    }
  }

  async runMergeContinue(): Promise<void> {
    await this.git.raw(['merge', '--continue', '--no-edit']);
  }

  async runMergeAbort(): Promise<void> {
    await this.git.raw(['merge', '--abort']);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async fileExists(relativePath: string): Promise<boolean> {
    const fs = await import('fs/promises');
    const path = await import('path');
    try {
      await fs.access(path.join(this.repoPath, relativePath));
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Worktree parser ──────────────────────────────────────────────────────

function parseWorktreeList(raw: string): WorktreeInfo[] {
  const blocks = raw.trim().split('\n\n').filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\n');
    const path = lines.find((l) => l.startsWith('worktree '))?.replace('worktree ', '') ?? '';
    const head = lines.find((l) => l.startsWith('HEAD '))?.replace('HEAD ', '') ?? '';
    const branchLine = lines.find((l) => l.startsWith('branch '));
    const branch = branchLine
      ? branchLine.replace('branch ', '').replace('refs/heads/', '')
      : '(detached)';
    const isMain = lines.some((l) => l === 'main worktree') || blocks.indexOf(block) === 0;
    const isLocked = lines.some((l) => l.startsWith('locked'));
    return { path, head, branch, isMain, isLocked };
  });
}
