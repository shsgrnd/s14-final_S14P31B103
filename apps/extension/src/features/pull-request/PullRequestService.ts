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

import type { GitHubClient } from '../../integrations/github/GitHubClient';
import { GitHubApiError } from '../../integrations/github/interfaces';
import type {
  CreatePullRequestInput,
  PullRequestCreatedResult,
} from '../../integrations/github/interfaces';
import type { PullRequestServiceContract } from './interfaces';
import type { GitService } from '../git/GitService';
import { GitHubClient as GitHubClientImpl } from '../../integrations/github/GitHubClient';


export class PullRequestService implements PullRequestServiceContract {
  constructor(
    /** GitHub API 어댑터 */
    private readonly githubClient: GitHubClient,
    /** Git 서비스 (remote URL 조회에 사용) */
    private readonly gitService: GitService,
  ) {}

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
