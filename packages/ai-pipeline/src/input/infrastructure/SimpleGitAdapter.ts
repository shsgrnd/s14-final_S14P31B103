import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import { GitClient } from '../ports/GitClient';
import { GitStatus, DiffResult } from '@gitcat/shared-types';

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

  /**
   * 두 브랜치의 공통 조상 커밋 해시를 반환한다.
   * @spec I-03-getMergeBase: getMergeBase(source: string, target: string): Promise<string>
   */
  async getMergeBase(source: string, target: string, repoPath?: string): Promise<string> {
    try {
      const git = repoPath ? simpleGit(repoPath) : this.git;
      // git merge-base <source> <target> 명령 실행
      const result = await git.raw(['merge-base', source, target]);
      return result.trim();
    } catch (error) {
      console.error('[AiPipeline:GitAdapter] getMergeBase 실패', error);
      throw error;
    }
  }

  /**
   * 특정 커밋이나 브랜치의 파일 내용을 반환한다.
   * 충돌 후보 생성 시 base/source/target 의 코드를 각각 조회하기 위해 사용됨.
   */
  async getFileContent(filePath: string, ref: string, repoPath?: string): Promise<string> {
    try {
      const git = repoPath ? simpleGit(repoPath) : this.git;
      // git show <ref>:<filePath>
      return await git.show([`${ref}:${filePath}`]);
    } catch (error) {
      // 파일이 해당 ref에 존재하지 않는 경우 (생성 전 혹은 삭제됨) 빈 문자열 반환
      console.warn(`[AiPipeline:GitAdapter] getFileContent 파일 접근 불가 (존재하지 않음 예상): ${filePath} at ${ref}`);
      return '';
    }
  }

  /**
   * 두 브랜치 간 diff 결과를 반환한다.
   * @spec I-03-getDiff: getDiff(base: string, branch: string): Promise<DiffResult[]>
   */
  async getDiff(base: string, branch: string, repoPath?: string): Promise<DiffResult[]> {
    try {
      const git = repoPath ? simpleGit(repoPath) : this.git;
      // `-U3` 은 3줄의 context line을 유지하라는 옵션입니다 (충돌 분석시 문맥 유용)
      const diffOutput = await git.diff([base, branch, '-U3']);
      return this.parseRawDiff(diffOutput);
    } catch (error) {
      console.error('[AiPipeline:GitAdapter] getDiff 실패', error);
      throw error;
    }
  }

  /**
   * Raw Git Unified Diff text를 파싱하여 DiffResult 배열로 변환하는 내부 공통 헬퍼 메서드
   */
  private parseRawDiff(rawDiff: string): DiffResult[] {
    if (!rawDiff) return [];
    
    const results: DiffResult[] = [];
    const fileDiffs = rawDiff.split(/^diff --git/m).filter(Boolean);

    for (const fileDiff of fileDiffs) {
      const lines = fileDiff.split('\n');
      let currentFilePath = '';
      const hunks: string[] = [];
      let currentHunk: string[] = [];

      for (const line of lines) {
        if (line.startsWith('--- a/')) {
          // base file
        } else if (line.startsWith('+++ b/')) {
          currentFilePath = line.replace('+++ b/', '').trim();
        } else if (line.startsWith('@@ ')) {
          // 새로운 hunk 시작
          if (currentHunk.length > 0) {
            hunks.push(currentHunk.join('\n'));
            currentHunk = [];
          }
          currentHunk.push(line);
        } else if (currentHunk.length > 0) {
          currentHunk.push(line);
        }
      }

      if (currentHunk.length > 0) {
        hunks.push(currentHunk.join('\n'));
      }

      if (currentFilePath && hunks.length > 0) {
        results.push({
          file_path: currentFilePath,
          hunks: hunks
        });
      }
    }

    return results;
  }
}
