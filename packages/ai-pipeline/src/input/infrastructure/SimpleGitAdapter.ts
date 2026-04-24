import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import { GitClient } from '../ports/GitClient';
import { GitStatus } from 'shared-types';

/**
 * simple-git을 이용해 AI 파이프라인용 Git 상태를 수집하는 어댑터
 * 05_internal_interface_spec.csv (I-03-getStatus, I-03-getStagedDiff) 기준
 */
export class SimpleGitAdapter implements GitClient {
  private git: SimpleGit;

  /**
   * @param workingDir VS Code 워크스페이스 루트 절대 경로
   */
  constructor(workingDir: string) {
    const options: Partial<SimpleGitOptions> = {
      baseDir: workingDir,
      binary: 'git',
      maxConcurrentProcesses: 6,
    };
    this.git = simpleGit(options);
  }

  /**
   * staged 변경사항 diff 텍스트를 반환한다.
   * @spec I-03-getStagedDiff: getStagedDiff(): Promise<string>
   * @param repoPath 선택적 저장소 경로 (기본값: 생성자 주입 경로)
   */
  async getStagedDiff(repoPath?: string): Promise<string> {
    try {
      const git = repoPath ? simpleGit(repoPath) : this.git;
      return await git.diff(['--staged']);
    } catch (error) {
      console.error('[AiPipeline:GitAdapter] getStagedDiff 실패', error);
      throw error;
    }
  }

  /**
   * 현재 브랜치 및 staged/unstaged/untracked 상태를 반환한다.
   * @spec I-03-getStatus: getStatus(): Promise<GitStatus>
   * @param repoPath 선택적 저장소 경로 (기본값: 생성자 주입 경로)
   */
  async getStatus(repoPath?: string): Promise<GitStatus> {
    try {
      const git = repoPath ? simpleGit(repoPath) : this.git;
      const summary = await git.status();

      return {
        current: summary.current || '',
        staged: summary.staged,
        unstaged: [
          ...summary.modified.filter((f) => !summary.staged.includes(f)),
          ...summary.deleted.filter((f) => !summary.staged.includes(f)),
        ],
        untracked: summary.not_added,
        conflicted: summary.conflicted,
      };
    } catch (error) {
      console.error('[AiPipeline:GitAdapter] getStatus 실패', error);
      throw error;
    }
  }
}
