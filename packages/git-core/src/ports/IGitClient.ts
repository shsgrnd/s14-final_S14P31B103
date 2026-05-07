/**
 * IGitClient — Git 제어 계층의 Port(추상) 인터페이스
 *
 * 구현체(CLI adapter 등)는 이 인터페이스를 implements 하며,
 * Extension Host 비즈니스 로직은 이 타입에만 의존한다.
 */

import type {
  GitStatus,
  BranchInfo,
  StashEntry,
  LogEntry,
  MergeResult,
  DiffResult,
  WorktreeInfo,
} from '../domain/gitTypes';

export interface IGitClient {
  // ─── Query ───────────────────────────────────────────────────────────────

  /** 현재 Git 저장소 상태 (staged / unstaged / untracked / currentBranch 등) */
  getStatus(): Promise<GitStatus>;

  fetchAllPrune(): Promise<void>;

  /** 로컬 브랜치 목록 반환 */
  getBranches(): Promise<BranchInfo[]>;

  /** 기본 브랜치(master, main 등) 감지 후 반환 */
  getDefaultBranch(): Promise<string | null>;

  /** 병합 완료된 브랜치명 목록 반환 */
  getMergedBranches(): Promise<string[]>;

  /** staged 변경사항 diff 텍스트 반환 (AI 추천 입력 준비용) */
  getStagedDiff(): Promise<string>;

  /** 두 브랜치 간 diff 결과 반환 (ConflictAnalyzer 입력용) */
  getDiff(base: string, branch: string): Promise<DiffResult[]>;

  /** 두 브랜치 간 실제 diff patch 텍스트 반환 (PR 추천 입력용) */
  getDiffText(base: string, branch: string): Promise<string>;

  getUnpushedFiles(): Promise<DiffResult[]>;

  /** 두 브랜치의 공통 조상 커밋 해시 반환 */
  getMergeBase(source: string, target: string): Promise<string>;

  /** 워크트리 정보 목록 반환 */
  getWorktrees(): Promise<WorktreeInfo[]>;

  /** 최근 커밋 로그 반환 (PR 추천 보조 입력용) */
  getLog(limit?: number): Promise<LogEntry[]>;

  /** 두 지점(브랜치/커밋) 사이의 커밋 로그 반환 (PR 추천 입력용) */
  getLogBetween(base: string, branch: string): Promise<LogEntry[]>;

  /**
   * 지정한 remote의 URL을 반환한다 (예: 'origin' → https://github.com/owner/repo.git)
   * GitHub PR 생성 시 owner/repo 파싱에 사용한다.
   */
  getRemoteUrl(remote?: string): Promise<string>;

  // ─── Command ─────────────────────────────────────────────────────────────

  /** 파일 목록을 staging area에 추가 */
  stageFiles(filePaths: string[]): Promise<void>;

  /** 모든 변경 파일을 staging area에 추가 (git add .) */
  stageAll(): Promise<void>;

  /** 파일 목록을 staging area에서 제거 (git restore --staged) */
  unstageFiles(filePaths: string[]): Promise<void>;

  /** 새 브랜치 생성 */
  createBranch(name: string): Promise<void>;

  /** 브랜치 전환 */
  checkoutBranch(name: string): Promise<void>;

  /** 브랜치 생성 + 즉시 전환 */
  createAndCheckoutBranch(name: string): Promise<void>;

  /** 로컬 브랜치 삭제 */
  deleteBranch(name: string, force?: boolean): Promise<void>;

  /** staged 변경사항으로 커밋 생성 */
  runCommit(message: string, body?: string): Promise<void>;

  /** 현재 브랜치를 원격에 push */
  push(remote?: string, branch?: string): Promise<void>;

  /** 현재 브랜치를 원격에서 pull */
  pull(remote?: string, branch?: string): Promise<void>;

  // ─── Stash ───────────────────────────────────────────────────────────────

  /** stash 목록 반환 */
  stashList(): Promise<StashEntry[]>;

  /** 변경사항을 stash로 저장 */
  stashSave(message?: string): Promise<void>;

  /** stash 적용 (워킹 트리 유지) */
  stashApply(ref?: string): Promise<void>;

  /** stash 적용 후 목록에서 제거 */
  stashPop(ref?: string): Promise<void>;

  /** stash 항목 삭제 */
  stashDrop(ref?: string): Promise<void>;

  // ─── Merge ───────────────────────────────────────────────────────────────

  /** 두 브랜치를 병합하고 결과 반환 */
  runMerge(source: string, target?: string): Promise<MergeResult>;

  /** 중단된 병합 계속 진행 */
  runMergeContinue(): Promise<void>;

  /** 진행 중인 병합 취소 */
  runMergeAbort(): Promise<void>;
}
