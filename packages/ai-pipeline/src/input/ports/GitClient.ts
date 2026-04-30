import { GitStatus, DiffResult } from '@gitcat/shared-types';

/**
 * AI 파이프라인의 Git 데이터 수집 인터페이스
 * 05_internal_interface_spec.csv (I-03-getStatus, I-03-getStagedDiff) 기준
 */
export interface GitClient {
  /**
   * 현재 브랜치 및 staged/unstaged/untracked 상태를 반환한다.
   * @spec I-03-getStatus: getStatus(): Promise<GitStatus>
   */
  getStatus(repoPath?: string): Promise<GitStatus>;

  /**
   * staged 변경사항 diff 텍스트를 반환한다.
   * @spec I-03-getStagedDiff: getStagedDiff(): Promise<string>
   */
  getStagedDiff(repoPath?: string): Promise<string>;

  /**
   * 두 브랜치의 공통 조상 커밋 해시를 반환한다.
   * @spec I-03-getMergeBase: getMergeBase(source: string, target: string): Promise<string>
   * @param source 소스 브랜치명 (예: feature/auth)
   * @param target 타겟 브랜치명 (예: develop)
   * @param repoPath 선택적 저장소 경로
   */
  getMergeBase(source: string, target: string, repoPath?: string): Promise<string>;

  /**
   * 두 브랜치 간 diff 결과를 반환한다.
   * @spec I-03-getDiff: getDiff(base: string, branch: string): Promise<DiffResult[]>
   * @param base 비교 기준 커밋/브랜치 (예: merge base hash)
   * @param branch 비교 대상 브랜치
   * @param repoPath 선택적 저장소 경로
   */
  getDiff(base: string, branch: string, repoPath?: string): Promise<DiffResult[]>;

  /**
   * 특정 커밋이나 브랜치의 파일 내용을 반환한다. (충돌 후보 생성을 위한 내부 확장 기능)
   * @param filePath 읽어올 파일의 상대 경로
   * @param ref 커밋 해시, 브랜치명, 또는 'HEAD'
   * @param repoPath 선택적 저장소 경로
   */
  getFileContent(filePath: string, ref: string, repoPath?: string): Promise<string>;

  /**
   * 현재 작업 트리(Working Tree) 전체의 변경 사항 diff 텍스트를 반환한다.
   * @param repoPath 선택적 저장소 경로
   * @returns unified diff 형식의 문자열 (변경이 없으면 빈 문자열)
   */
  getWorkingTreeDiff(repoPath?: string): Promise<string>;

  /**
   *
   * @param repoPath 선택적 저장소 경로
   * @returns 변경된 파일의 상대 경로 배열 (예: ["src/auth/service.ts", "src/auth/dto.ts"])
   */
  getChangedFileNames(repoPath?: string): Promise<string[]>;
}
