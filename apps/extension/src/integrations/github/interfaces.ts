/**
 * GitHub 통합 모듈 인터페이스 정의
 *
 * GitHub API 호출에 사용하는 DTO와 결과 타입을 정의한다.
 * 실제 HTTP 구현(Octokit or fetch)은 GitHubClient에서 담당하고,
 * 이 파일은 타입 계약만 명시한다.
 *
 * [토큰 보안 원칙]
 * - GitHub token은 VS Code SecretStorage에만 저장한다.
 * - SQLite, 일반 파일, 환경변수 등에 저장하지 않는다.
 */

import type { ErrorCode } from '@gitcat/shared-types';

// ─── PR 생성 요청 DTO ──────────────────────────────────────────────────────────

/**
 * PR 생성에 필요한 모든 정보를 담는 입력 DTO.
 *
 * 프론트 CREATE_PR 메시지 payload → PullRequestService 입력으로 사용된다.
 */
export interface CreatePullRequestInput {
  /** GitHub 저장소 owner (사용자명 또는 조직명) */
  owner: string;
  /** GitHub 저장소 이름 */
  repo: string;
  /** 병합 대상 base 브랜치 */
  baseBranch: string;
  /** 병합 소스 head 브랜치 */
  headBranch: string;
  /** PR 제목 */
  title: string;
  /** PR 본문 (markdown) */
  body: string;
  /** 코드 리뷰어 GitHub 사용자명 목록 (optional) */
  reviewers?: string[];
  /** assignees GitHub 사용자명 목록 (optional) */
  assignees?: string[];
  /** 라벨 이름 목록 (optional) */
  labels?: string[];
  /** GitHub milestone 번호 (optional) */
  milestone?: number;
}

// ─── PR 생성 성공 결과 ──────────────────────────────────────────────────────────

/**
 * GitHub API PR 생성 성공 시 반환하는 결과.
 *
 * Webview로 전달될 PR_CREATED 응답의 payload 구조와 일치한다.
 */
export interface PullRequestCreatedResult {
  /** GitHub PR 번호 */
  prNumber: number;
  /** GitHub PR 페이지 URL */
  htmlUrl: string;
  /** PR 제목 */
  title: string;
  /** base 브랜치명 */
  base: string;
  /** head 브랜치명 */
  head: string;
}

export interface PullRequestTemplate {
  path: string;
  name: string;
  content: string;
}

// ─── GitHub API 에러 ───────────────────────────────────────────────────────────

/**
 * GitHub API 호출 중 발생하는 구조화된 에러.
 *
 * 각 에러 상황을 ErrorCode로 분류해 Webview가 사용자에게
 * 구체적인 안내 메시지를 표시할 수 있도록 한다.
 *
 * - GITHUB_AUTH_FAILED: token이 없거나 만료됨
 * - GITHUB_REMOTE_NOT_FOUND: 원격 저장소 정보를 알 수 없음
 * - GITHUB_BRANCH_NOT_PUSHED: head 브랜치가 원격에 push되지 않음
 * - GITHUB_INVALID_BRANCH: base 또는 head 브랜치명이 GitHub에 없음
 * - GITHUB_API_FAILED: GitHub REST API 호출 실패 (네트워크, 권한 등)
 * - GITHUB_METADATA_FAILED: reviewers/assignees/labels/milestone 설정 실패
 */
export class GitHubApiError extends Error {
  constructor(
    /** GitCat 표준 에러 코드 */
    public readonly errorCode: ErrorCode,
    message: string,
    /** 원본 GitHub API 에러 (디버깅용, optional) */
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

// ─── GitHub 원격 저장소 정보 ────────────────────────────────────────────────────

/**
 * Git remote URL에서 파싱한 GitHub 저장소 식별 정보.
 *
 * 예: https://github.com/octocat/hello-world → { owner: 'octocat', repo: 'hello-world' }
 * 예: git@github.com:octocat/hello-world.git → { owner: 'octocat', repo: 'hello-world' }
 */
export interface GitHubRepoInfo {
  owner: string;
  repo: string;
}
