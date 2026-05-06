import * as vscode from 'vscode';
import { RecommendationOrchestrator } from './interfaces';
import { InboundPayloadSchemaMap } from '@gitcat/shared-types/src/schemas/messages';
import { ErrorCode } from '@gitcat/shared-types/src/enums/error-codes';

export class RecommendationHandler {
  constructor(private readonly recommendationService: RecommendationOrchestrator) { }

  async handle(type: string, payload: any, webview: vscode.Webview): Promise<boolean> {
    switch (type) {
      case 'RECOMMEND_PR':
        await this.handleRecommendPR(payload, webview);
        return true;

      default:
        return false;
    }
  }

  private async handleRecommendPR(
    payload: any,
    webview: vscode.Webview
  ): Promise<void> {
    this.sendLoading(webview, 'RECOMMEND_PR', true);
    try {
      const validatedPayload = InboundPayloadSchemaMap.RECOMMEND_PR.parse(payload);

      const result = await this.recommendationService.recommendPR(validatedPayload.base);

      webview.postMessage({
        type: 'PR_SUGGESTION',
        payload: {
          markdown: result.markdown,
        },
      });

    } catch (err: any) {
      this.sendError(webview, 'AI_REQUEST_FAILED', err?.message ?? 'PR 설명 추천 중 오류가 발생했습니다.');
    } finally {
      this.sendLoading(webview, 'RECOMMEND_PR', false);
    }
  }

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
