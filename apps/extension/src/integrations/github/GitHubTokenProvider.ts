/**
 * GitHubTokenProvider — VS Code SecretStorage / Authentication 기반 GitHub token 관리
 *
 * GitHub token은 보안상 반드시 VS Code SecretStorage에만 저장해야 한다.
 * SQLite, 환경변수, 일반 파일에 저장하면 안 된다.
 *
 * 키 이름: 'gitcat.github.token'
 *
 * [토큰 조회 순서]
 * 1. 사용자가 직접 저장한 Personal Access Token
 * 2. VS Code GitHub 로그인 세션 token
 */

import * as vscode from 'vscode';

/** SecretStorage에서 사용하는 GitHub token 키 */
const GITHUB_TOKEN_SECRET_KEY = 'gitcat.github.token';
const GITHUB_AUTH_PROVIDER_ID = 'github';
const GITHUB_AUTH_SCOPES = ['repo'];

export class GitHubTokenProvider {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /**
   * GitHub API 호출용 token을 조회한다.
   *
   * 저장된 PAT가 있으면 우선 사용하고, 없으면 VS Code GitHub 로그인 세션을 요청한다.
   * 로그인 세션 token은 SQLite/일반 파일/SecretStorage에 재저장하지 않는다.
   */
  async getToken(): Promise<string | undefined> {
    try {
      const storedToken = await this.secrets.get(GITHUB_TOKEN_SECRET_KEY);
      if (storedToken) {
        return storedToken;
      }

      const session = await vscode.authentication.getSession(
        GITHUB_AUTH_PROVIDER_ID,
        GITHUB_AUTH_SCOPES,
        { createIfNone: true },
      );

      return session.accessToken;
    } catch (error) {
      console.error('[GitCat] GitHubTokenProvider: GitHub token 조회 실패', error);
      return undefined;
    }
  }

  /**
   * GitHub personal access token을 SecretStorage에 저장한다.
   *
   * @param token GitHub personal access token (ghp_...)
   */
  async setToken(token: string): Promise<void> {
    try {
      await this.secrets.store(GITHUB_TOKEN_SECRET_KEY, token);
      console.log('[GitCat] GitHubTokenProvider: token 저장 완료');
    } catch (error) {
      console.error('[GitCat] GitHubTokenProvider: token 저장 실패', error);
      throw error;
    }
  }

  /**
   * 저장된 GitHub token을 삭제한다.
   *
   * 로그아웃 또는 token 교체 시 사용한다.
   */
  async deleteToken(): Promise<void> {
    try {
      await this.secrets.delete(GITHUB_TOKEN_SECRET_KEY);
      console.log('[GitCat] GitHubTokenProvider: token 삭제 완료');
    } catch (error) {
      console.error('[GitCat] GitHubTokenProvider: token 삭제 실패', error);
      throw error;
    }
  }
}
