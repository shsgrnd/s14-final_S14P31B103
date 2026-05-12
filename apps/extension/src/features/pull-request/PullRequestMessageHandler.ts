/**
 * PullRequestMessageHandler — PR 생성 관련 메시지 핸들러
 *
 * 처리하는 메시지:
 * 1. CREATE_PR — 사용자가 확인 후 Create Pull Request 버튼 클릭 시
 *    → PullRequestService.createPullRequest() 호출
 *    → 성공: PR_CREATED 메시지 전송
 *    → 실패: ERROR 메시지 (errorCode 포함)
 *
 * 2. OPEN_PR_PANEL — PR 패널 진입을 요청할 때
 *    → validateHeadBranchReady()로 push 상태 검증
 *    → 검증 실패: ERROR { code: 'GITHUB_BRANCH_NOT_PUSHED', message } 전송 후 패널 미개방
 *    → 검증 성공: openPullRequestPanel() 호출 후 NOTIFICATION 전송
 *      프론트는 이 응답을 받아 base branch를 결정하고
 *      곧바로 RECOMMEND_PR 메시지를 전송해 추천 흐름을 시작한다.
 *
 * 3. GET_PR_TEMPLATES — PR 템플릿 목록 조회 시
 *    → PullRequestService.listPullRequestTemplates() 호출
 *    → 성공: PR_TEMPLATES 메시지 전송
 *    → 실패: ERROR 메시지 (errorCode 포함)
 *
 * 4. GET_PR_FORM_METADATA — PR 패널에서 reviewers/assignees/labels 후보 데이터 요청 시
 *    → PullRequestService.listPrFormMetadata() 호출
 *    → 성공: PR_FORM_METADATA 메시지 전송
 *    → 실패: ERROR 메시지 (errorCode 포함)
 *
 * [주의]
 * - RECOMMEND_PR은 PrRecommendationHandler가 처리한다 (이 핸들러는 관여하지 않음)
 * - textarea에 description을 직접 입력하는 코드는 없음 (Webview 담당)
 * - PR 생성 후 GitHub merge는 구현하지 않음
 *
 * [PR 패널 진입 조건 — push 검증 흐름]
 * 프론트가 OPEN_PR_PANEL 메시지를 보내면:
 *   1. git fetch --all --prune 으로 원격 최신화
 *   2. Detached HEAD 여부 → GITHUB_INVALID_BRANCH 에러
 *   3. 원격 tracking 브랜치 없음 → GITHUB_BRANCH_NOT_PUSHED 에러
 *   4. 로컬 커밋이 원격보다 앞섬(ahead > 0) → GITHUB_BRANCH_NOT_PUSHED 에러
 *   5. 모두 통과 → 패널 오픈 + NOTIFICATION 전송
 * 프론트는 ERROR 응답을 받으면 Git 섹션/전역 알림으로 사용자에게 안내한다.
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
    private readonly closePullRequestPanel?: () => void,
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

      case 'GET_PR_FORM_METADATA':
        await this.handleGetPrFormMetadata(payload, webview);
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

  private async handleGetPrFormMetadata(payload: any, webview: vscode.Webview): Promise<void> {
    this.sendLoading(webview, 'GET_PR_FORM_METADATA', true);

    try {
      InboundPayloadSchemaMap.GET_PR_FORM_METADATA.parse(payload ?? {});
      const meta = await this.pullRequestService.listPrFormMetadata();
      webview.postMessage({
        type: 'PR_FORM_METADATA',
        payload: meta,
      });
    } catch (error: any) {
      if (error instanceof GitHubApiError) {
        this.sendError(webview, error.errorCode, error.message);
      } else {
        this.sendError(
          webview,
          'INVALID_PARAMETER',
          `PR 메타데이터 조회를 처리할 수 없습니다: ${error?.message ?? String(error)}`,
        );
      }
    } finally {
      this.sendLoading(webview, 'GET_PR_FORM_METADATA', false);
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

      // 성공 응답 — 프론트는 이 메시지를 받아 PR 링크를 표시한다.
      // 부분 실패(reviewers 등)는 metadataWarnings로 함께 전달해 사용자에게 명시적으로 안내한다.
      const metadataWarnings = result.metadataWarnings ?? [];
      webview.postMessage({
        type: 'PR_CREATED',
        payload: {
          prNumber: result.prNumber,
          htmlUrl: result.htmlUrl,
          title: result.title,
          base: result.base,
          head: result.head,
          metadataWarnings,
        },
      });

      // VS Code 알림으로도 PR URL 표시 (사용자 편의)
      vscode.window.showInformationMessage(
        metadataWarnings.length > 0
          ? `PR이 생성되었습니다(일부 메타데이터 설정 실패): ${result.title}`
          : `PR이 생성되었습니다: ${result.title}`,
        'GitHub에서 보기',
      ).then((selection) => {
        if (selection === 'GitHub에서 보기') {
          vscode.env.openExternal(vscode.Uri.parse(result.htmlUrl));
        }
      });

      // 부분 실패가 있으면 별도 NOTIFICATION 으로도 안내 (인패널 배너로 사용)
      for (const warning of metadataWarnings) {
        webview.postMessage({
          type: 'NOTIFICATION',
          payload: { type: 'warning', message: warning },
        });
      }

      // 패널 자동 종료는 하지 않는다 — 사용자가 PR 링크와 경고를 확인한 뒤 직접 닫도록 함.
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
   * - 패널이 열릴 때 백엔드는 push 상태를 먼저 검증한다.
   * - push되지 않은 브랜치라면 ERROR를 반환하고 패널을 열지 않는다.
   * - 검증 통과 시에만 openPullRequestPanel()을 호출해 패널을 연다.
   * - 실제 PR description 추천은 프론트가 base branch를 결정한 뒤
   *   RECOMMEND_PR 메시지를 전송하면 PrRecommendationHandler가 처리한다.
   *
   * [프론트 연결 가이드]
   * - ERROR { code: 'GITHUB_BRANCH_NOT_PUSHED' } 응답을 받으면:
   *   → 패널을 열지 말고, Git 섹션 또는 전역 알림으로 사용자에게 안내한다.
   * - NOTIFICATION { type: 'info' } 응답을 받으면:
   *   → 패널이 열린 것을 의미하며, RECOMMEND_PR 요청을 보낼 수 있다.
   *   1. 기본 base branch(예: 'main')가 정해진 경우 → 즉시 RECOMMEND_PR 전송
   *   2. base branch 미선택 → 사용자가 선택한 뒤 RECOMMEND_PR 전송
   */
  private async handleOpenPRPanel(_payload: any, webview: vscode.Webview): Promise<void> {
    // ─── 1. push 상태 검증 ────────────────────────────────────────────────────
    // 원격 브랜치가 없거나 ahead 커밋이 있으면 패널을 열지 않고 ERROR를 반환한다.
    // 프론트는 code: 'GITHUB_BRANCH_NOT_PUSHED'를 받아 사용자에게 안내한다.
    console.log('[GitCat] PullRequestMessageHandler: OPEN_PR_PANEL — push 상태 검증 시작');
    const validation = await this.pullRequestService.validateHeadBranchReady();

    if (!validation.ok) {
      // push되지 않았거나 브랜치 상태가 올바르지 않으면 패널을 열지 않는다.
      console.warn(
        `[GitCat] PullRequestMessageHandler: OPEN_PR_PANEL 차단 — code: ${validation.code}, message: ${validation.message}`,
      );
      this.sendError(webview, validation.code, validation.message);
      return; // 패널 오픈 없이 종료
    }

    // ─── 2. 검증 통과 시에만 패널을 연다 ─────────────────────────────────────
    console.log(
      `[GitCat] PullRequestMessageHandler: OPEN_PR_PANEL 통과 — branch: ${validation.branch}, remote: ${validation.remoteBranch}`,
    );
    this.openPullRequestPanel?.();

    // PR 패널 진입 확인 알림 전송
    // 프론트는 이 NOTIFICATION을 받은 후 RECOMMEND_PR 요청을 보내야 한다.
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
