/**
 * GitHubClient — GitHub REST API 어댑터
 *
 * Node.js 내장 https 모듈을 사용해 GitHub API를 직접 호출한다.
 * (Octokit 등 외부 라이브러리 없이 VS Code Extension 내부에서 동작 가능)
 *
 * [호출 흐름]
 * 1. GitHubTokenProvider.getToken() → token 조회
 * 2. GitHub REST API 호출 (Authorization: Bearer <token>)
 * 3. 응답 파싱 → 성공 결과 또는 GitHubApiError throw
 *
 * [담당 메서드]
 * - createPullRequest: PR 생성
 * - requestReviewers: PR reviewers 추가
 * - updateIssueMetadata: assignees, labels, milestone 업데이트
 *
 * [기존 원격 URL 파싱]
 * Git remote URL을 파싱해 owner/repo를 자동으로 추출한다.
 */

import * as https from 'https';
import type { GitHubTokenProvider } from './GitHubTokenProvider';
import type {
  CreatePullRequestInput,
  PullRequestCreatedResult,
  GitHubRepoInfo,
  PullRequestTemplate,
} from './interfaces';
import { GitHubApiError } from './interfaces';

/** GitHub API Base URL */
const GITHUB_API_BASE = 'api.github.com';
const PR_TEMPLATE_PATHS = [
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
] as const;

export class GitHubClient {
  constructor(private readonly tokenProvider: GitHubTokenProvider) {}

  // ─── PR 생성 ────────────────────────────────────────────────────────────────

  /**
   * GitHub REST API를 통해 Pull Request를 생성한다.
   *
   * 1. token 조회 → 없으면 GITHUB_AUTH_FAILED
   * 2. POST /repos/{owner}/{repo}/pulls 호출
   * 3. 성공 시 prNumber, htmlUrl, title, base, head 반환
   * 4. reviewers가 있으면 requestReviewers 연속 호출
   * 5. assignees/labels/milestone이 있으면 updateIssueMetadata 연속 호출
   */
  async createPullRequest(input: CreatePullRequestInput): Promise<PullRequestCreatedResult> {
    const token = await this.tokenProvider.getToken();
    if (!token) {
      throw new GitHubApiError(
        'GITHUB_AUTH_FAILED',
        'GitHub token이 설정되지 않았습니다. 설정에서 GitHub Personal Access Token을 입력해주세요.',
      );
    }

    const body = JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.headBranch,
      base: input.baseBranch,
    });

    let prData: any;
    try {
      // PR 기본 생성
      prData = await this.request(
        token,
        'POST',
        `/repos/${input.owner}/${input.repo}/pulls`,
        body,
      );
    } catch (error) {
      if (error instanceof GitHubApiError) {
        throw error;
      }
      throw new GitHubApiError(
        'GITHUB_API_FAILED',
        `GitHub PR 생성에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }

    const prNumber: number = prData.number;

    // reviewers 설정 (실패해도 PR 자체는 성공으로 처리하되, 에러 로그 기록)
    if (input.reviewers && input.reviewers.length > 0) {
      try {
        await this.requestReviewers(token, input.owner, input.repo, prNumber, input.reviewers);
      } catch (error) {
        // GITHUB_METADATA_FAILED는 reviewers 설정 실패를 의미
        // PR 자체는 생성되었으므로 에러를 throw하지 않고 로그만 남긴다
        console.warn('[GitCat] GitHubClient: reviewers 설정 실패 (PR은 생성됨)', error);
        throw new GitHubApiError(
          'GITHUB_METADATA_FAILED',
          `PR이 생성되었지만 reviewers 설정에 실패했습니다 (PR #${prNumber}). 수동으로 설정해주세요.`,
          error,
        );
      }
    }

    // assignees, labels, milestone 업데이트 (옵션)
    const hasMetadata =
      (input.assignees && input.assignees.length > 0) ||
      (input.labels && input.labels.length > 0) ||
      input.milestone !== undefined;

    if (hasMetadata) {
      try {
        await this.updateIssueMetadata(
          token,
          input.owner,
          input.repo,
          prNumber,
          {
            assignees: input.assignees,
            labels: input.labels,
            milestone: input.milestone,
          },
        );
      } catch (error) {
        console.warn('[GitCat] GitHubClient: 메타데이터 설정 실패 (PR은 생성됨)', error);
        throw new GitHubApiError(
          'GITHUB_METADATA_FAILED',
          `PR이 생성되었지만 assignees/labels/milestone 설정에 실패했습니다 (PR #${prNumber}).`,
          error,
        );
      }
    }

    return {
      prNumber,
      htmlUrl: prData.html_url,
      title: prData.title,
      base: prData.base?.ref ?? input.baseBranch,
      head: prData.head?.ref ?? input.headBranch,
    };
  }

  // ─── Reviewers 추가 ──────────────────────────────────────────────────────────

  /**
   * PR에 reviewers를 추가한다.
   *
   * @param token GitHub API token
   * @param owner 저장소 owner
   * @param repo 저장소 이름
   * @param prNumber PR 번호
   * @param reviewers 리뷰어 GitHub 사용자명 배열
   */
  async requestReviewers(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
    reviewers: string[],
  ): Promise<void> {
    const body = JSON.stringify({ reviewers });
    await this.request(
      token,
      'POST',
      `/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
      body,
    );
  }

  // ─── Assignees / Labels / Milestone 업데이트 ─────────────────────────────────

  /**
   * PR (issue로서)에 assignees, labels, milestone을 설정한다.
   *
   * GitHub에서 PR은 동시에 Issue이기도 하므로 Issues API를 사용한다.
   */
  async updateIssueMetadata(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
    metadata: {
      assignees?: string[];
      labels?: string[];
      milestone?: number;
    },
  ): Promise<void> {
    const patchBody: Record<string, unknown> = {};
    if (metadata.assignees !== undefined) {
      patchBody.assignees = metadata.assignees;
    }
    if (metadata.labels !== undefined) {
      patchBody.labels = metadata.labels;
    }
    if (metadata.milestone !== undefined) {
      patchBody.milestone = metadata.milestone;
    }

    const body = JSON.stringify(patchBody);
    await this.request(
      token,
      'PATCH',
      `/repos/${owner}/${repo}/issues/${prNumber}`,
      body,
    );
  }

  // ─── 원격 URL에서 owner/repo 파싱 ─────────────────────────────────────────────

  /**
   * Git remote URL에서 GitHub owner와 repo 이름을 추출한다.
   *
   * 지원 형식:
   * - https://github.com/owner/repo.git
   * - https://github.com/owner/repo
   * - git@github.com:owner/repo.git
   *
   * @param remoteUrl git remote origin URL
   * @returns { owner, repo } 또는 null (파싱 불가 시)
   */
  async listPullRequestTemplates(
    owner: string,
    repo: string,
    ref?: string,
  ): Promise<PullRequestTemplate[]> {
    const token = await this.tokenProvider.getToken();
    if (!token) {
      throw new GitHubApiError(
        'GITHUB_AUTH_FAILED',
        'GitHub token이 설정되어 있지 않습니다. GitHub Personal Access Token을 먼저 설정해주세요.',
      );
    }

    const templates: PullRequestTemplate[] = [];
    for (const templatePath of PR_TEMPLATE_PATHS) {
      const template = await this.getPullRequestTemplateFile(
        token,
        owner,
        repo,
        templatePath,
        ref,
      );
      if (template) {
        templates.push(template);
      }
    }

    return templates;
  }

  private async getPullRequestTemplateFile(
    token: string,
    owner: string,
    repo: string,
    templatePath: string,
    ref?: string,
  ): Promise<PullRequestTemplate | null> {
    const encodedPath = templatePath.split('/').map(encodeURIComponent).join('/');
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';

    let data: any;
    try {
      data = await this.request(
        token,
        'GET',
        `/repos/${owner}/${repo}/contents/${encodedPath}${query}`,
      );
    } catch (error) {
      if (error instanceof GitHubApiError && error.errorCode === 'GITHUB_REMOTE_NOT_FOUND') {
        return null;
      }
      throw error;
    }

    if (!data || Array.isArray(data) || data.type !== 'file' || typeof data.content !== 'string') {
      return null;
    }

    return {
      path: templatePath,
      name: data.name ?? templatePath.split('/').pop() ?? templatePath,
      content: Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf8'),
    };
  }

  static parseGitHubRepoInfo(remoteUrl: string): GitHubRepoInfo | null {
    // HTTPS 형식: https://github.com/owner/repo[.git]
    const httpsMatch = remoteUrl.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    // SSH 형식: git@github.com:owner/repo[.git]
    const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    return null;
  }

  // ─── HTTP 요청 헬퍼 ──────────────────────────────────────────────────────────

  /**
   * GitHub REST API에 HTTP 요청을 보내고 JSON 응답을 파싱한다.
   *
   * Node.js 내장 https 모듈 사용 (외부 라이브러리 불필요).
   * 4xx/5xx 응답은 GitHubApiError로 변환한다.
   *
   * @param token GitHub API token
   * @param method HTTP 메서드 (GET, POST, PATCH 등)
   * @param path API 경로 (/repos/owner/repo/pulls 등)
   * @param body 요청 본문 (JSON 문자열, optional)
   */
  private request(
    token: string,
    method: string,
    path: string,
    body?: string,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: GITHUB_API_BASE,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${token}`,
          // GitHub API는 User-Agent 헤더를 필수로 요구한다
          'User-Agent': 'GitCat-VSCode-Extension',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      };

      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => chunks.push(chunk));

        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          let parsed: any;

          // 응답 본문이 있을 때만 JSON 파싱 시도
          try {
            parsed = rawBody.length > 0 ? JSON.parse(rawBody) : {};
          } catch {
            parsed = { message: rawBody };
          }

          const status = res.statusCode ?? 0;

          if (status >= 200 && status < 300) {
            // 성공 응답
            resolve(parsed);
          } else if (status === 401 || status === 403) {
            // 인증/권한 오류
            reject(
              new GitHubApiError(
                'GITHUB_AUTH_FAILED',
                `GitHub 인증 실패 (${status}): ${parsed.message ?? '권한이 없습니다. token을 확인해주세요.'}`,
              ),
            );
          } else if (status === 422) {
            // Validation failed — 브랜치 오류나 이미 존재하는 PR 등
            const githubMessage: string = parsed.message ?? '';
            const errors: any[] = parsed.errors ?? [];

            // head 브랜치 관련 오류 감지
            if (
              githubMessage.toLowerCase().includes('head') ||
              errors.some((e: any) => e.field === 'head')
            ) {
              reject(
                new GitHubApiError(
                  'GITHUB_BRANCH_NOT_PUSHED',
                  `head 브랜치가 GitHub에 push되지 않았거나 브랜치명이 잘못되었습니다: ${githubMessage}`,
                ),
              );
            } else if (
              githubMessage.toLowerCase().includes('base') ||
              errors.some((e: any) => e.field === 'base')
            ) {
              reject(
                new GitHubApiError(
                  'GITHUB_INVALID_BRANCH',
                  `base 브랜치가 잘못되었습니다: ${githubMessage}`,
                ),
              );
            } else {
              reject(
                new GitHubApiError(
                  'GITHUB_API_FAILED',
                  `GitHub API 검증 오류 (422): ${githubMessage}`,
                ),
              );
            }
          } else if (status === 404) {
            // 원격 저장소를 찾을 수 없음
            reject(
              new GitHubApiError(
                'GITHUB_REMOTE_NOT_FOUND',
                `GitHub 저장소를 찾을 수 없습니다 (404). owner/repo 정보를 확인해주세요.`,
              ),
            );
          } else {
            // 그 외 모든 API 오류
            reject(
              new GitHubApiError(
                'GITHUB_API_FAILED',
                `GitHub API 호출 실패 (${status}): ${parsed.message ?? '알 수 없는 오류'}`,
              ),
            );
          }
        });
      });

      req.on('error', (error: Error) => {
        reject(
          new GitHubApiError(
            'GITHUB_API_FAILED',
            `GitHub API 네트워크 오류: ${error.message}`,
            error,
          ),
        );
      });

      // 요청 본문이 있으면 전송
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }
}
