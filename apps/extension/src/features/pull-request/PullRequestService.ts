/**
 * PullRequestService — GitHub PR 생성 오케스트레이션 서비스
 *
 * [담당 역할]
 * 1. Git remote URL에서 owner/repo 정보 추출
 * 2. GitHubClient를 통해 GitHub API 호출
 * 3. 실패 시 에러를 구조화된 GitHubApiError로 전달
 *
 * [하지 않는 것]
 * - PR description 추천 (PrRecommendationService 담당)
 * - recommendation_histories 저장 (추천 기능 담당)
 * - Git 데이터 수집 (GitService 담당)
 *
 * [의존 주입]
 * - GitHubClient: 실제 GitHub API 호출 어댑터
 * - getRemoteUrl: Git remote URL 조회 함수 (GitService 메서드)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { GitHubClient } from '../../integrations/github/GitHubClient';
import { GitHubApiError } from '../../integrations/github/interfaces';
import type {
  CreatePullRequestInput,
  PullRequestCreatedResult,
  PullRequestTemplate,
} from '../../integrations/github/interfaces';
import type { ErrorCode } from '@gitcat/shared-types';
import type { PullRequestServiceContract } from './interfaces';
import type { GitService } from '../git/GitService';
import { GitHubClient as GitHubClientImpl } from '../../integrations/github/GitHubClient';

const PR_TEMPLATE_PATHS = [
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
] as const;

export type PullRequestBranchValidationResult =
  | {
      ok: true;
      branch: string;
      remoteBranch: string;
    }
  | {
      ok: false;
      code: ErrorCode;
      message: string;
    };

export class PullRequestService implements PullRequestServiceContract {
  constructor(
    /** GitHub API 어댑터 */
    private readonly githubClient: GitHubClient,
    /** Git 서비스 (remote URL 조회에 사용) */
    private readonly gitService: GitService,
  ) {}

  async listPullRequestTemplates(input: { base?: string } = {}): Promise<PullRequestTemplate[]> {
    const localTemplates = await this.listLocalPullRequestTemplates();
    if (localTemplates.length > 0) {
      return localTemplates;
    }

    const repoInfo = await this.resolveOwnerAndRepo();
    return this.githubClient.listPullRequestTemplates(repoInfo.owner, repoInfo.repo, input.base);
  }

  async validateHeadBranchReady(
    headBranch?: string,
  ): Promise<PullRequestBranchValidationResult> {
    try {
      await this.gitService.fetchAllPrune();
    } catch (error: any) {
      return {
        ok: false,
        code: 'GIT_OPERATION_FAILED',
        message: `원격 브랜치 상태를 확인할 수 없습니다. 네트워크 또는 Git remote 설정을 확인해 주세요: ${error?.message ?? String(error)}`,
      };
    }

    const [status, branches] = await Promise.all([
      this.gitService.getStatus(),
      this.gitService.getBranches(),
    ]);

    if (!headBranch && status.isDetachedHead) {
      return {
        ok: false,
        code: 'GITHUB_INVALID_BRANCH',
        message: 'Detached HEAD 상태에서는 PR을 생성할 수 없습니다. 브랜치를 체크아웃한 뒤 다시 시도해 주세요.',
      };
    }

    const branchName = headBranch ?? status.currentBranch;
    if (!branchName || branchName === 'HEAD') {
      return {
        ok: false,
        code: 'GITHUB_INVALID_BRANCH',
        message: 'PR을 생성할 head 브랜치를 확인할 수 없습니다. 브랜치를 체크아웃한 뒤 다시 시도해 주세요.',
      };
    }

    // ── 미커밋 변경사항 확인 ────────────────────────────────────────────────
    // 현재 체크아웃된 브랜치에 대해 PR을 생성하려고 할 때, 커밋하지 않은 작업 내역이 있다면 차단
    if (branchName === status.currentBranch) {
      const hasUncommittedChanges = status.staged.length > 0 || status.unstaged.length > 0;
      if (hasUncommittedChanges) {
        return {
          ok: false,
          code: 'GITHUB_INVALID_BRANCH', // 프론트엔드에서 에러로 표시하기 적합한 코드 사용
          message: '현재 브랜치에 커밋되지 않은 변경사항이 있습니다. 먼저 변경사항을 커밋해 주세요.',
        };
      }
    }

    const localBranch = branches.find((branch) => !branch.isRemote && branch.name === branchName);
    const remoteBranchName = localBranch?.trackingBranch ?? `origin/${branchName}`;
    const remoteBranch = branches.find((branch) => branch.isRemote && branch.name === remoteBranchName);

    // ── 원격 브랜치 존재 여부 확인 ───────────────────────────────────────
    // fetch 이후에도 원격 브랜치가 없으면 한 번도 push하지 않은 것이다.
    if (!remoteBranch) {
      return {
        ok: false,
        code: 'GITHUB_BRANCH_NOT_PUSHED',
        message: `현재 브랜치 '${branchName}'가 원격에 없습니다. 먼저 push한 뒤 PR 생성을 다시 시도해 주세요.`,
      };
    }

    // ── commit hash 비교 ──────────────────────────────────────────────────
    // lastCommitHash가 undefined인 경우 비교 불가능 → getUnpushedFiles()로 대체 판단
    // 둘 다 있고 값이 다르면 명확히 미push 상태이다.
    if (localBranch?.lastCommitHash && remoteBranch.lastCommitHash) {
      if (localBranch.lastCommitHash !== remoteBranch.lastCommitHash) {
        return {
          ok: false,
          code: 'GITHUB_BRANCH_NOT_PUSHED',
          message: `현재 브랜치 '${branchName}'의 로컬 커밋이 원격 브랜치 '${remoteBranchName}'와 다릅니다. 먼저 push 또는 동기화한 뒤 PR 생성을 다시 시도해 주세요.`,
        };
      }
    } else {
      // ── fallback: rev-list 기반 미push 커밋 직접 탐지 ────────────────────
      // status.ahead는 tracking 브랜치가 설정되지 않은 경우 0을 반환하므로 신뢰할 수 없다.
      // getUnpushedFiles()는 내부적으로 `git rev-list @{u}..HEAD`를 사용해
      // tracking 설정과 무관하게 실제 미push 파일 목록을 정확히 반환한다.
      try {
        const unpushedFiles = await this.gitService.getUnpushedFiles();
        if (unpushedFiles.length > 0) {
          return {
            ok: false,
            code: 'GITHUB_BRANCH_NOT_PUSHED',
            message: `현재 브랜치 '${branchName}'에 아직 push되지 않은 커밋이 있습니다 (변경 파일 ${unpushedFiles.length}개). 먼저 push한 뒤 PR 생성을 다시 시도해 주세요.`,
          };
        }
      } catch {
        // @{u} 없음(tracking 브랜치 미설정) 예외 → 보수적으로 status.ahead로 fallback
        // status.ahead > 0이 아니더라도 원격 브랜치가 존재하므로 넘어간다.
        if (status.ahead > 0) {
          return {
            ok: false,
            code: 'GITHUB_BRANCH_NOT_PUSHED',
            message: `현재 브랜치 '${branchName}'에 아직 push되지 않은 커밋이 ${status.ahead}개 있습니다. 먼저 push한 뒤 PR 생성을 다시 시도해 주세요.`,
          };
        }
      }
    }

    return {
      ok: true,
      branch: branchName,
      remoteBranch: remoteBranchName,
    };
  }

  private async listLocalPullRequestTemplates(): Promise<PullRequestTemplate[]> {
    const status = await this.gitService.getStatus();
    const templates: PullRequestTemplate[] = [];

    for (const templatePath of PR_TEMPLATE_PATHS) {
      const absolutePath = path.join(status.repoRoot, templatePath);
      try {
        const content = await fs.readFile(absolutePath, 'utf8');
        templates.push({
          path: templatePath,
          name: path.basename(templatePath),
          content,
        });
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    return templates;
  }

  /**
   * GitHub PR을 생성한다.
   *
   * 흐름:
   * 1. Git remote URL 조회 → owner/repo 파싱
   * 2. 파싱 실패 시 GITHUB_REMOTE_NOT_FOUND 에러
   * 3. GitHubClient.createPullRequest() 호출
   * 4. 성공 결과 반환
   */
  async createPullRequest(input: CreatePullRequestInput): Promise<PullRequestCreatedResult> {
    const validation = await this.validateHeadBranchReady(input.headBranch);
    if (!validation.ok) {
      throw new GitHubApiError(validation.code, validation.message);
    }

    // ─── 1. owner/repo 조회 ───────────────────────────────────────────────
    // input에 owner/repo가 이미 있으면 그것을 사용하고,
    // 없으면 Git remote URL에서 자동으로 추출한다.
    let owner = input.owner;
    let repo = input.repo;

    if (!owner || !repo) {
      const repoInfo = await this.resolveOwnerAndRepo();
      owner = repoInfo.owner;
      repo = repoInfo.repo;
    }

    // ─── 2. GitHub API 호출 ───────────────────────────────────────────────
    const result = await this.githubClient.createPullRequest({
      ...input,
      owner,
      repo,
    });

    console.log(
      `[GitCat] PullRequestService: PR 생성 성공 — #${result.prNumber} ${result.htmlUrl}`,
    );

    return result;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Git remote origin URL에서 GitHub owner와 repo를 추출한다.
   *
   * 실패하면 GITHUB_REMOTE_NOT_FOUND 에러를 throw한다.
   */
  private async resolveOwnerAndRepo(): Promise<{ owner: string; repo: string }> {
    let remoteUrl: string;
    try {
      remoteUrl = await this.gitService.getRemoteUrl('origin');
    } catch (error) {
      throw new GitHubApiError(
        'GITHUB_REMOTE_NOT_FOUND',
        `Git remote 'origin' URL을 가져올 수 없습니다. remote를 먼저 설정해주세요.`,
        error,
      );
    }

    // GitHub URL인지 확인하고 owner/repo 파싱 (static 메서드 직접 사용)
    const repoInfo = GitHubClientImpl.parseGitHubRepoInfo(remoteUrl);

    if (!repoInfo) {
      throw new GitHubApiError(
        'GITHUB_REMOTE_NOT_FOUND',
        `'origin' remote URL이 GitHub 형식이 아닙니다: ${remoteUrl}`,
      );
    }

    return repoInfo;
  }
}
