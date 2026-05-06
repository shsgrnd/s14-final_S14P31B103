import * as vscode from 'vscode';
import type { ErrorCode, OutboundMessage } from '@gitcat/shared-types';
import { BranchRecommendationRequestSchema } from './BranchRecommendationDto';
import { BranchRecommendationService } from './BranchRecommendationService';

/**
 * 추천 관련 Webview 메시지 중 브랜치명 추천 요청만 처리합니다.
 * payload 검증, 로딩 표시, 서비스 호출, 성공/실패 응답 전송을 한곳에 모읍니다.
 */
export class BranchRecommendationMessageHandler {
  constructor(private readonly service: BranchRecommendationService) {}

  public async handle(type: string, payload: unknown, webview: vscode.Webview): Promise<boolean> {
    if (type !== 'RECOMMEND_BRANCH') {
      return false;
    }

    const parseResult = BranchRecommendationRequestSchema.safeParse(payload);
    if (!parseResult.success) {
      this.postError(webview, 'INVALID_PARAMETER', parseResult.error.issues[0]?.message ?? '브랜치 추천 요청이 올바르지 않습니다.');
      return true;
    }

    this.postLoading(webview, true);
    try {
      const result = await this.service.recommendBranch(parseResult.data);
      webview.postMessage({
        type: 'BRANCH_SUGGESTIONS',
        payload: { names: result.names },
      } as OutboundMessage);
      if (result.warnings.length > 0) {
        webview.postMessage({
          type: 'NOTIFICATION',
          payload: { type: 'info', message: result.warnings[0] },
        } as OutboundMessage);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postError(webview, 'AI_REQUEST_FAILED', message);
    } finally {
      this.postLoading(webview, false);
    }

    return true;
  }

  private postLoading(webview: vscode.Webview, loading: boolean): void {
    webview.postMessage({
      type: 'LOADING',
      payload: { target: 'branchRecommendation', loading },
    } as OutboundMessage);
  }

  private postError(webview: vscode.Webview, code: ErrorCode, message: string): void {
    webview.postMessage({
      type: 'ERROR',
      payload: { code, message },
    } as OutboundMessage);
  }
}
