import { GitStatus } from '@gitcat/shared-types';

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
}
