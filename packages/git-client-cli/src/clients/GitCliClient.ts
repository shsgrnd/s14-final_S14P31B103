/**
 * GitCliClient — simple-git 기반 IGitClient 구현체
 *
 * 외부 의존성: simple-git (^3.22.0)
 *
 * 비즈니스 로직 없이 순수 Git CLI 래핑만 담당하며,
 * 에러는 GitError로 래핑해서 throw 한다.
 */

import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
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
    const [status, repoRoot, currentWorktreePath] = await Promise.all([
      this.git.status(),
      this.getRepoRoot(),
      this.getCurrentWorktreePath(),
    ]);

    const mapEntry = (item: { path: string; index: string; working_dir: string }): FileStatusEntry => ({
      path: item.path,
      index: item.index,
      working_dir: item.working_dir,
    });

    const gitDir = await this.getGitDir();
    const isMerging = await this.fileExistsInGitDir(gitDir, 'MERGE_HEAD');
    const isRebasing = await this.fileExistsInGitDir(gitDir, 'rebase-merge')
      || await this.fileExistsInGitDir(gitDir, 'rebase-apply');
    const conflicted = status.conflicted;
    const conflictedSet = new Set(conflicted);
    const staged = status.files
      .filter((entry) => !conflictedSet.has(entry.path) && entry.index.trim() && entry.index !== '?')
      .map(mapEntry);
    const unstaged = status.files
      .filter((entry) => !conflictedSet.has(entry.path) && entry.working_dir.trim() && entry.working_dir !== '?')
      .map(mapEntry);

    return {
      repoRoot,
      currentWorktreePath,
      currentBranch: status.current ?? 'HEAD',
      isDetachedHead: status.detached,
      ahead: status.ahead,
      behind: status.behind,
      staged,
      unstaged,
      untracked: status.not_added,
      conflicted,
      isConflict: conflicted.length > 0,
      isMerging,
      isRebasing,
    };
  }

  async fetchAllPrune(): Promise<void> {
    await this.git.raw(['fetch', '--all', '--prune']);
  }

  async getBranches(): Promise<BranchInfo[]> {
    const [status, refsRaw, mergedRaw] = await Promise.all([
      this.git.status(),
      this.git.raw([
        'for-each-ref',
        '--format=%(refname)%00%(refname:short)%00%(objectname:short)%00%(subject)%00%(upstream:short)%00%(committerdate:iso8601)',
        'refs/heads',
        'refs/remotes',
      ]),
      this.git.raw(['branch', '--merged']).catch(() => ''),
    ]);
    const mergedSet = new Set(
      mergedRaw
        .split('\n')
        .map((l) => l.trim().replace(/^\*\s*/, ''))
        .filter(Boolean),
    );

    return refsRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [refName, shortName, commit, subject, upstream, lastCommitDate] = line.split('\x00');
        const isRemote = refName.startsWith('refs/remotes/');
        const name = shortName ?? '';
        return {
          name,
          isCurrent: !isRemote && name === status.current,
          isRemote,
          trackingBranch: upstream || undefined,
          lastCommitHash: commit || undefined,
          lastCommitMessage: subject || undefined,
          lastCommitDate: lastCommitDate || undefined,
          isMerged: !isRemote && mergedSet.has(name),
        };
      })
      .filter((branch) => branch.name && !branch.name.endsWith('/HEAD'));
  }

  async getDefaultBranch(): Promise<string | null> {
    try {
      // origin/HEAD 심볼릭 링크 확인 (예: refs/remotes/origin/main)
      const symbolicRef = await this.git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
      if (symbolicRef) {
        const parts = symbolicRef.trim().split('/');
        return parts[parts.length - 1];
      }
    } catch {
      // 실패 시 무시하고 다음 방법 시도
    }

    try {
      // 로컬 설정 확인
      const defaultConfig = await this.git.raw(['config', '--get', 'init.defaultBranch']);
      if (defaultConfig) {
        return defaultConfig.trim();
      }
    } catch {
      // 실패 시 무시
    }

    return null;
  }

  async getMergedBranches(): Promise<string[]> {
    const raw = await this.git.raw(['branch', '--merged']);
    return raw
      .split('\n')
      .map((l) => l.trim().replace(/^\*\s*/, ''))
      .filter(Boolean);
  }

  async getStagedDiff(): Promise<string> {
    return this.git.raw([
      '-c',
      'core.quotePath=false',
      'diff',
      '--staged',
      '--patch',
      '--no-ext-diff',
    ]);
  }

  async getDiff(base: string, branch: string): Promise<DiffResult[]> {
    const raw = await this.git.diff([`${base}...${branch}`, '--name-status', '--diff-filter=ACDMRT']);
    return parseNameStatusDiff(raw);
  }

  async getDiffText(base: string, branch: string): Promise<string> {
    return this.git.diff([`${base}...${branch}`]);
  }

  /**
   * 지정한 remote의 fetch URL을 반환한다.
   *
   * GitHub PR 생성 시 owner/repo 자동 추출에 사용한다.
   * remote가 없거나 GitHub URL이 아닌 경우에는 상위 계층에서 오류 처리한다.
   *
   * @param remote remote 이름 (기본값: 'origin')
   */
  async getRemoteUrl(remote = 'origin'): Promise<string> {
    try {
      const url = await this.git.raw(['remote', 'get-url', remote]);
      return url.trim();
    } catch (error: any) {
      throw new GitError(
        `remote '${remote}'의 URL을 가져올 수 없습니다: ${error?.message ?? String(error)}`,
        `git remote get-url ${remote}`,
        error?.exitCode ?? 1,
        error?.stderr ?? String(error),
      );
    }
  }

  // ─── Stage / Unstage ────────────────────────────────────────────────────

  async getUnpushedFiles(): Promise<DiffResult[]> {
    const upstream = await this.git
      .raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
      .then((value) => value.trim())
      .catch(() => '');
    if (!upstream) return [];

    const raw = await this.git.diff([`${upstream}..HEAD`, '--name-status', '--diff-filter=ACDMRT']);
    return parseNameStatusDiff(raw);
  }


  async getMergeBase(source: string, target: string): Promise<string> {
    const result = await this.git.raw(['merge-base', source, target]);
    return result.trim();
  }

  async resolveRevision(ref: string): Promise<string> {
    try {
      return (await this.git.revparse([`${ref}^{commit}`])).trim();
    } catch (err: unknown) {
      const error = err as { message?: string; exitCode?: number; stderr?: string };
      throw new GitError(
        `Failed to resolve revision: ${ref}`,
        `git rev-parse ${ref}^{commit}`,
        error?.exitCode ?? 1,
        error?.stderr ?? error?.message ?? String(err),
      );
    }
  }

  async showFileAtRevision(revision: string, filePath: string): Promise<string> {
    try {
      return await this.git.show([`${revision}:${filePath}`]);
    } catch (err: unknown) {
      const error = err as { message?: string; exitCode?: number; stderr?: string };
      throw new GitError(
        `Failed to read ${filePath} at ${revision}`,
        `git show ${revision}:${filePath}`,
        error?.exitCode ?? 1,
        error?.stderr ?? error?.message ?? String(err),
      );
    }
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

  async getLogBetween(base: string, branch: string): Promise<LogEntry[]> {
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
      `${base}..${branch}`,
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
    // `git merge --continue --no-edit` fails on some git versions because
    // --no-edit is treated as a positional argument. Use `git commit --no-edit`
    // instead, which is the equivalent operation when the repo is in MERGING state.
    await this.git.raw(['commit', '--no-edit']);
  }

  async runMergeAbort(): Promise<void> {
    await this.git.raw(['merge', '--abort']);
  }

  async checkoutMergeOurs(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) {
      return;
    }
    await this.git.checkout(['--ours', '--', ...filePaths]);
  }

  async readIndexStage(filePath: string, stage: 2 | 3): Promise<string> {
    return this.git.show([`:${stage}:${filePath}`]);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async getRepoRoot(): Promise<string> {
    return (await this.git.revparse(['--show-toplevel'])).trim();
  }

  private async getCurrentWorktreePath(): Promise<string> {
    return (await this.git.revparse(['--show-toplevel'])).trim();
  }

  private async getGitDir(): Promise<string> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const rawGitDir = (await this.git.revparse(['--git-dir'])).trim();
    const gitDir = path.isAbsolute(rawGitDir) ? rawGitDir : path.resolve(this.repoPath, rawGitDir);
    const stat = await fs.stat(gitDir);
    if (stat.isDirectory()) {
      return gitDir;
    }
    return path.dirname(gitDir);
  }

  private async fileExistsInGitDir(gitDir: string, relativePath: string): Promise<boolean> {
    const fs = await import('fs/promises');
    const path = await import('path');
    try {
      await fs.access(path.join(gitDir, relativePath));
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

function parseNameStatusDiff(raw: string): DiffResult[] {
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
