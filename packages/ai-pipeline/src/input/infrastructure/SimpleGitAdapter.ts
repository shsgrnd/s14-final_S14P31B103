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
   * HEAD 기준 전체 작업 트리 변경 사항(staged + unstaged) diff 텍스트를 반환한다.
   *
   * @param repoPath 선택적 저장소 경로 (기본값: 생성자 주입 경로)
   * @returns unified diff 형식의 문자열. 변경사항이 전혀 없으면 빈 문자열('')을 반환합니다.
   */
  async getWorkingTreeDiff(repoPath?: string): Promise<string> {
    try {
      const git = repoPath ? simpleGit(repoPath) : this.git;

      // `git diff HEAD -U5` : HEAD 기준 staged + unstaged 변경 사항을 모두 가져옵니다.
      // -U5 옵션: 변경 라인 주변 5줄의 context를 포함해 AI가 맥락을 파악하기 쉽게 합니다.
      const diffText = await git.diff(['HEAD', '-U5']);

      if (diffText === null || diffText === undefined) {
        console.warn('[AiPipeline:GitAdapter] getWorkingTreeDiff: git diff HEAD 결과 없음, staged diff로 fallback합니다.');
        return await git.diff(['--staged', '-U5']);
      }

      return diffText;
    } catch (error) {
      console.warn('[AiPipeline:GitAdapter] getWorkingTreeDiff 실패, staged diff로 fallback합니다:', error);
      try {
        const git = repoPath ? simpleGit(repoPath) : this.git;
        return await git.diff(['--staged']);
      } catch (fallbackError) {
        console.error('[AiPipeline:GitAdapter] fallback getStagedDiff도 실패:', fallbackError);
        return '';
      }
    }
  }

  /**
   * HEAD 기준으로 변경된 파일 경로 목록만 반환한다.
   *
   * `git diff HEAD --name-only` 명령을 실행합니다.
   * 파일 이름 목록만 필요한 경우 전체 diff보다 훨씬 빠르고 메모리를 적게 사용합니다.
   * RelatedFilesCollector에서 related_files 목록을 구성할 때 사용됩니다.
   *
   * @param repoPath 선택적 저장소 경로
   * @returns 변경된 파일의 상대 경로 배열 (중복 없음, 빈 줄 제외)
   */
  async getChangedFileNames(repoPath?: string): Promise<string[]> {
    try {
      const git = repoPath ? simpleGit(repoPath) : this.git;

      // HEAD 기준 staged + unstaged 변경 파일 이름 목록
      const headOutput = await git.diff(['HEAD', '--name-only']);
      const fromHead = this.parseFileNames(headOutput);

      // HEAD가 없는 초기 저장소에서는 staged-only 목록도 포함합니다.
      const stagedOutput = await git.diff(['--staged', '--name-only']);
      const fromStaged = this.parseFileNames(stagedOutput);

      // 두 목록을 합쳐 중복을 제거합니다.
      return Array.from(new Set([...fromHead, ...fromStaged]));
    } catch (error) {
      console.warn('[AiPipeline:GitAdapter] getChangedFileNames HEAD 조회 실패, staged만 반환합니다:', error);
      try {
        const git = repoPath ? simpleGit(repoPath) : this.git;
        const stagedOutput = await git.diff(['--staged', '--name-only']);
        return this.parseFileNames(stagedOutput);
      } catch {
        return [];
      }
    }
  }

  /**
   * `git diff --name-only` 출력을 파일 경로 배열로 파싱하는 내부 헬퍼.
   * 빈 줄과 공백만 있는 줄을 제거합니다.
   */
  private parseFileNames(output: string): string[] {
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
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

      const staged: any[] = [];
      const unstaged: any[] = [];
      const untracked: any[] = [];
      const conflicted: any[] = [];

      const mapCodeToType = (code: string): any => {
        switch (code.toUpperCase()) {
          case 'A': return 'ADDED';
          case 'D': return 'DELETED';
          case 'R': return 'RENAMED';
          case 'U': return 'CONFLICTED';
          case '?': return 'UNTRACKED';
          case 'M':
          default:
            return 'MODIFIED';
        }
      };

      summary.files.forEach((file) => {
        const path = file.path;

        // Conflicted (U)
        if (file.index === 'U' || file.working_dir === 'U') {
          conflicted.push({ path, status: 'CONFLICTED' });
          return;
        }

        // Staged (Index)
        if (file.index !== ' ' && file.index !== '?') {
          staged.push({
            path,
            status: mapCodeToType(file.index),
          });
        }

        // Unstaged (Working Directory)
        if (file.working_dir !== ' ' && file.working_dir !== '?') {
          unstaged.push({
            path,
            status: mapCodeToType(file.working_dir),
          });
        }

        // Untracked
        if (file.index === '?' && file.working_dir === '?') {
          untracked.push({
            path,
            status: 'UNTRACKED',
          });
        }
      });

      return {
        branch: summary.current || '',
        isMergeInProgress: summary.conflicted.length > 0,
        staged,
        unstaged,
        untracked,
        conflicted,
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
