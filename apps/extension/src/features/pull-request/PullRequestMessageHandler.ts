/**
 * PullRequestMessageHandler — PR 생성 관련 메시지 핸들러
 *
 * 처리하는 메시지:
 * 1. CREATE_PR — 사용자가 확인 후 Create Pull Request 버튼 클릭 시
 *    → PullRequestService.createPullRequest() 호출
 *    → 성공: PR_CREATED 메시지 전송
 *    → 실패: ERROR 메시지 (errorCode 포함)
 *
 * 2. OPEN_PR_PANEL — PR 패널 진입 시
 *    → 현재 브랜치 정보와 함께 LOADING 없이 단순 응답
 *    → 프론트는 이 응답을 받아 base branch를 결정하고
 *      곧바로 RECOMMEND_PR 메시지를 전송해 추천 흐름을 시작한다.
 *
 * [주의]
 * - RECOMMEND_PR은 PrRecommendationHandler가 처리한다 (이 핸들러는 관여하지 않음)
 * - textarea에 description을 직접 입력하는 코드는 없음 (Webview 담당)
 * - PR 생성 후 GitHub merge는 구현하지 않음
 */

import * as vscode from 'vscode';
import type { PullRequestService } from './PullRequestService';
import { GitHubApiError } from '../../integrations/github/interfaces';
import type { ErrorCode } from '@gitcat/shared-types';
import { InboundPayloadSchemaMap } from '@gitcat/shared-types';

export class PullRequestMessageHandler {
  constructor(
    private readonly pullRequestService: PullRequestService,
    private readonly openPullRequestPanel?: () => void,
  ) {}

  /**
   * 수신한 메시지 type을 확인해 처리 가능하면 true를 반환한다.
   * 처리 대상이 아니면 false를 반환해 다음 핸들러로 넘긴다.
   */
  async handle(type: string, payload: any, webview: vscode.Webview): Promise<boolean> {
    switch (type) {
      case 'GET_PR_TEMPLATES':
        await this.handleGetPRTemplates(payload, webview);
        return true;

      case 'CREATE_PR':
        await this.handleCreatePR(payload, webview);
        return true;

      case 'OPEN_PR_PANEL':
        await this.handleOpenPRPanel(payload, webview);
        return true;

      default:
        return false;
    }
  }

  // ─── CREATE_PR 처리 ─────────────────────────────────────────────────────────

  /**
   * PR 생성 요청을 처리한다.
   *
   * 흐름:
   * 1. payload 검증 (Zod — title, description, base, headBranch 필수)
   * 2. LOADING 시작 알림
   * 3. PullRequestService.createPullRequest() 호출
   * 4. 성공: PR_CREATED { prNumber, htmlUrl, title, base, head } 전송
   * 5. 실패: ERROR { code, message } 전송
   * 6. LOADING 종료 알림
   */
  private async handleGetPRTemplates(payload: any, webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'GET_PR_TEMPLATES', true);

    try {
      const validated = InboundPayloadSchemaMap.GET_PR_TEMPLATES.parse(payload ?? {});
      const templates = await this.pullRequestService.listPullRequestTemplates({
        base: validated.base,
      });

      webview.postMessage({
        type: 'PR_TEMPLATES',
        payload: { templates },
      });
    } catch (error: any) {
      if (error instanceof GitHubApiError) {
        this.sendError(webview, error.errorCode, error.message);
      } else {
        this.sendError(
          webview,
          'INVALID_PARAMETER',
          `PR 템플릿 조회 요청을 처리할 수 없습니다: ${error?.message ?? String(error)}`,
        );
      }
    } finally {
      this.sendLoading(webview, 'GET_PR_TEMPLATES', false);
    }
  }

  private async handleCreatePR(payload: any, webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'CREATE_PR', true);

    try {
      // Zod 스키마로 payload 검증 (headBranch, reviewers 등 포함)
      const validated = InboundPayloadSchemaMap.CREATE_PR.parse(payload);

      const result = await this.pullRequestService.createPullRequest({
        // owner/repo는 PullRequestService가 Git remote에서 자동 추출
        owner: '',
        repo: '',
        baseBranch: validated.base,
        headBranch: validated.headBranch,
        title: validated.title,
        body: validated.description,
        reviewers: validated.reviewers,
        assignees: validated.assignees,
        labels: validated.labels,
        milestone: validated.milestone,
      });

      // 성공 응답 — 프론트는 이 메시지를 받아 PR 링크를 표시하거나 패널을 닫는다
      webview.postMessage({
        type: 'PR_CREATED',
        payload: {
          prNumber: result.prNumber,
          htmlUrl: result.htmlUrl,
          title: result.title,
          base: result.base,
          head: result.head,
        },
      });

      // VS Code 알림으로도 PR URL 표시 (사용자 편의)
      vscode.window.showInformationMessage(
        `✅ PR이 생성되었습니다: ${result.title}`,
        'GitHub에서 보기',
      ).then((selection) => {
        if (selection === 'GitHub에서 보기') {
          vscode.env.openExternal(vscode.Uri.parse(result.htmlUrl));
        }
      });
    } catch (error: any) {
      // GitHubApiError는 errorCode를 가져 구체적인 원인 전달 가능
      if (error instanceof GitHubApiError) {
        this.sendError(webview, error.errorCode, error.message);
      } else {
        // Zod 검증 오류 또는 예상치 못한 오류
        this.sendError(
          webview,
          'INVALID_PARAMETER',
          `PR 생성 요청이 올바르지 않습니다: ${error?.message ?? String(error)}`,
        );
      }
    } finally {
      this.sendLoading(webview, 'CREATE_PR', false);
    }
  }

  // ─── OPEN_PR_PANEL 처리 ──────────────────────────────────────────────────────

  /**
   * PR 패널 진입을 처리한다.
   *
   * [역할]
   * - 패널이 열릴 때 백엔드가 해줄 수 있는 것은 PR 생성 흐름 초기화뿐이다.
   * - 실제 PR description 추천은 프론트가 base branch를 결정한 뒤
   *   RECOMMEND_PR 메시지를 전송하면 PrRecommendationHandler가 처리한다.
   *
   * [프론트 연결 가이드]
   * - OPEN_PR_PANEL 응답을 받으면 프론트는:
   *   1. 기본 base branch(예: 'main')가 정해진 경우 → 즉시 RECOMMEND_PR 전송
   *   2. base branch 미선택 → 사용자가 선택한 뒤 RECOMMEND_PR 전송
   *
   * 현재 구현: NOTIFICATION으로 패널 열림을 알리는 단순 응답만 전송
   */
  private async handleOpenPRPanel(_payload: any, webview: vscode.Webview): Promise<void> {
    this.openPullRequestPanel?.();

    // PR 패널 진입 확인 — 프론트는 이 응답 이후 RECOMMEND_PR 요청을 보내야 한다
    webview.postMessage({
      type: 'NOTIFICATION',
      payload: {
        type: 'info',
        message: 'PR 패널이 열렸습니다. base branch를 선택하면 PR description 추천이 시작됩니다.',
      },
    });
  }

  // ─── 공통 Helpers ────────────────────────────────────────────────────────────

  private sendLoading(webview: vscode.Webview, target: string, loading: boolean): void {
    webview.postMessage({ type: 'LOADING', payload: { target, loading } });
  }

  private sendError(webview: vscode.Webview, code: ErrorCode, message: string): void {
    webview.postMessage({
      type: 'ERROR',
      payload: { code, message },
    });
  }
}
