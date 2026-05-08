/**
 * PullRequest 기능 서비스 계약 인터페이스
 *
 * PullRequestService가 구현해야 하는 메서드 계약을 정의한다.
 * 테스트 목적이나 다른 구현체로 교체할 때 이 인터페이스를 기준으로 한다.
 *
 * [주의]
 * - GitHub token 관리는 GitHubTokenProvider 책임
 * - 원격 URL 파싱은 GitHubClient 책임
 * - 이 인터페이스는 "무엇을" 할 수 있는지만 명세한다
 */

import type {
  CreatePullRequestInput,
  PullRequestCreatedResult,
  PullRequestTemplate,
} from '../../integrations/github/interfaces';

/**
 * PR 생성 서비스 계약.
 *
 * PullRequestService가 이 인터페이스를 구현한다.
 */
export interface PullRequestServiceContract {
  /**
   * GitHub API를 통해 Pull Request를 생성한다.
   *
   * 흐름:
   * 1. token 조회 → 없으면 GITHUB_AUTH_FAILED 에러
   * 2. Git remote URL 파싱 → owner/repo 추출
   * 3. GitHub API로 PR 생성
   * 4. reviewers/assignees/labels/milestone 설정 (선택)
   * 5. 성공 결과 반환
   *
   * @throws GitHubApiError 실패 시 errorCode에 원인 코드 포함
   */
  createPullRequest(input: CreatePullRequestInput): Promise<PullRequestCreatedResult>;

  listPullRequestTemplates(input?: { base?: string }): Promise<PullRequestTemplate[]>;
}
