import * as vscode from 'vscode';
import { RecommendationOrchestrator } from './interfaces';

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
    payload: { base: string },
    webview: vscode.Webview
  ): Promise<void> {
    this.sendLoading(webview, 'RECOMMEND_PR', true);
    try {
      if (!payload.base) {
        throw new Error('기준 브랜치(base)가 필요합니다.');
      }

      const result = await this.recommendationService.recommendPR(payload.base);

      webview.postMessage({
        type: 'PR_SUGGESTION',
        payload: {
          suggestion: result.markdown,
        },
      });

    } catch (err: any) {
      this.sendError(webview, err?.message ?? 'PR 설명 추천 중 오류가 발생했습니다.');
    } finally {
      this.sendLoading(webview, 'RECOMMEND_PR', false);
    }
  }

  private sendLoading(webview: vscode.Webview, target: string, loading: boolean): void {
    webview.postMessage({ type: 'LOADING', payload: { target, loading } });
  }

  private sendError(webview: vscode.Webview, message: string): void {
    webview.postMessage({
      type: 'ERROR',
      payload: { code: 'RECOMMENDATION_FAILED', message },
    });
  }
}
