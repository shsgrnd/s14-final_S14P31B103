/**
 * PrRecommendationHandler — PR 설명 추천 메시지 핸들러
 *
 * RECOMMEND_PR 메시지만 처리하는 PR 전용 핸들러다.
 * 커밋명/브랜치명 추천 핸들러와 독립적으로 개발 가능하도록 분리되어 있다.
 *
 * 처리 흐름:
 * 1. RECOMMEND_PR 메시지 수신
 * 2. Zod로 payload 검증 (base 브랜치명 필수)
 * 3. PrRecommendationService.recommendPR() 호출
 * 4. 결과를 PR_SUGGESTION 메시지로 Webview에 전달
 */

import * as vscode from 'vscode';
import type { PrRecommendationOrchestrator } from './pr-recommendation-interfaces';
import { InboundPayloadSchemaMap } from '@gitcat/shared-types';
import { ErrorCode } from '@gitcat/shared-types';

export class PrRecommendationHandler {
  constructor(private readonly prRecommendationService: PrRecommendationOrchestrator) { }

  /**
   * 수신한 메시지 type을 확인해 RECOMMEND_PR이면 처리하고 true를 반환한다.
   * 처리 대상이 아니면 false를 반환해 다음 핸들러로 넘긴다.
   */
  async handle(type: string, payload: any, webview: vscode.Webview): Promise<boolean> {
    switch (type) {
      case 'RECOMMEND_PR':
        await this.handleRecommendPR(payload, webview);
        return true;

      default:
        return false;
    }
  }

  /**
   * PR 설명 추천 요청을 처리한다.
   *
   * - LOADING 시작/종료를 Webview에 알린다.
   * - 오류 발생 시 ERROR 메시지를 전달하고 LOADING을 종료한다.
   */
  private async handleRecommendPR(
    payload: any,
    webview: vscode.Webview,
  ): Promise<void> {
    this.sendLoading(webview, 'RECOMMEND_PR', true);
    try {
      // Zod 스키마로 payload 검증 (base 브랜치명 필수)
      const validatedPayload = InboundPayloadSchemaMap.RECOMMEND_PR.parse(payload);

      const result = await this.prRecommendationService.recommendPR(validatedPayload.base);

      webview.postMessage({
        type: 'PR_SUGGESTION',
        payload: {
          markdown: result.markdown,
        },
      });
    } catch (err: any) {
      this.sendError(
        webview,
        'AI_REQUEST_FAILED',
        err?.message ?? 'PR 설명 추천 중 오류가 발생했습니다.',
      );
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
