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

    const localBranch = branches.find((branch) => !branch.isRemote && branch.name === branchName);
    const remoteBranchName = localBranch?.trackingBranch ?? `origin/${branchName}`;
    const remoteBranch = branches.find((branch) => branch.isRemote && branch.name === remoteBranchName);

    if (!remoteBranch) {
      return {
        ok: false,
        code: 'GITHUB_BRANCH_NOT_PUSHED',
        message: `현재 브랜치 '${branchName}'가 원격에 없습니다. 먼저 push한 뒤 PR 생성을 다시 시도해 주세요.`,
      };
    }

    if (
      localBranch?.lastCommitHash &&
      remoteBranch.lastCommitHash &&
      localBranch.lastCommitHash !== remoteBranch.lastCommitHash
    ) {
      return {
        ok: false,
        code: 'GITHUB_BRANCH_NOT_PUSHED',
        message: `현재 브랜치 '${branchName}'의 로컬 커밋이 원격 브랜치 '${remoteBranchName}'와 다릅니다. 먼저 push 또는 동기화한 뒤 PR 생성을 다시 시도해 주세요.`,
      };
    }

    if (branchName === status.currentBranch && status.ahead > 0) {
      return {
        ok: false,
        code: 'GITHUB_BRANCH_NOT_PUSHED',
        message: `현재 브랜치 '${branchName}'에 아직 push되지 않은 커밋이 ${status.ahead}개 있습니다. 먼저 push한 뒤 PR 생성을 다시 시도해 주세요.`,
      };
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
