/**
 * Git 도메인 타입 정의
 *
 * shared-types의 BranchSchema(UI/메시지 계층용)와는 별개로,
 * 내부 Git 도메인 계층에서 사용하는 풍부한 타입을 제공한다.
 */

/** staged / unstaged / untracked 파일 항목 */
export interface FileStatusEntry {
  /** 워크스페이스 상대 경로 */
  path: string;
  /** git status 약어 (M, A, D, R, ?, U ...) */
  index: string;
  /** 워킹 트리 상태 */
  working_dir: string;
}

/**
 * git status 결과 전체
 * Webview 로 내보낼 때는 OutboundPayloadSchemaMap.GIT_STATUS_UPDATED.status 에 매핑
 */
export interface GitStatus {
  repoRoot: string;
  currentWorktreePath: string;
  currentBranch: string;
  isDetachedHead: boolean;
  ahead: number;
  behind: number;
  staged: FileStatusEntry[];
  unstaged: FileStatusEntry[];
  untracked: string[];
  conflicted: string[];
  isConflict: boolean;
  isMerging: boolean;
  isRebasing: boolean;
}

/**
 * 브랜치 정보
 * shared-types BranchSchema 보다 상세 — 메시지 응답 시 변환 필요
 */
export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  trackingBranch?: string;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  lastCommitDate?: string;
  /** 병합 완료 여부 (정리 기능용) */
  isMerged?: boolean;
}

/** git diff --stat / diff-tree 한 파일의 결과 */
export interface DiffResult {
  filePath: string;
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'U';
  additions: number;
  deletions: number;
  /** rename 시 이전 경로 */
  oldPath?: string;
}

/** git log 한 항목 */
export interface LogEntry {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  /** 풀 메시지(body 포함) */
  body?: string;
}

/** git stash list 한 항목 */
export interface StashEntry {
  index: number;
  /** stash@{0} 형식 */
  ref: string;
  message: string;
  branch: string;
  date: string;
}

/** git worktree list 결과 */
export interface WorktreeInfo {
  path: string;
  head: string;
  branch: string;
  isMain: boolean;
  isLocked: boolean;
}

/** git merge 결과 */
export interface MergeResult {
  success: boolean;
  /** 충돌 발생 파일 목록 (success=false 시 존재) */
  conflictedFiles?: string[];
  /** merge commit hash (success=true, fast-forward 아닌 경우) */
  mergeCommit?: string;
  stdout: string;
  stderr: string;
}

/** GitClient 가 throw 하는 에러 */
export class GitError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitError';
  }
}
