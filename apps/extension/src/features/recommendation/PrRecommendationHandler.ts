import * as vscode from 'vscode';
import {
  InboundPayloadSchemaMap,
  type ErrorCode,
  type OutboundMessage,
} from '@gitcat/shared-types';
import { PrRecommendationService } from './PrRecommendationService';

/**
 * PR 설명 추천 요청만 처리하는 Webview 메시지 핸들러.
 * payload 검증, 로딩 상태 전송, 서비스 호출, 성공/실패 응답 전송 담당.
 */
export class PrRecommendationHandler {
  constructor(private readonly prRecommendationService: PrRecommendationService) {}

  // 요청 메시지 타입 검증
  public async handle(type: string, payload: unknown, webview: vscode.Webview): Promise<boolean> {
    if (type !== 'RECOMMEND_PR') {
      return false;
    }

    // 요청 payload DTO 검증
    const parseResult = InboundPayloadSchemaMap.RECOMMEND_PR.safeParse(payload);
    if (!parseResult.success) {
      this.sendError(
        webview,
        'INVALID_PARAMETER',
        parseResult.error.issues[0]?.message ?? 'PR 추천 요청이 올바르지 않습니다.',
      );
      return true;
    }

    // webview로 로딩 상태 전송
    this.sendLoading(webview, true);

    // 서비스 호출 및 결과 응답 전송
    try {
      const result = await this.prRecommendationService.recommendPR(parseResult.data.base);
      webview.postMessage({
        type: 'PR_SUGGESTION',
        payload: { markdown: result.markdown },
      } as OutboundMessage);
    } catch (error) {
      // AI 요청 실패 시 웹뷰로 서비스에서 발생한 에러 메시지 전송
      const message = error instanceof Error ? error.message : String(error);
      this.sendError(webview, 'AI_REQUEST_FAILED', message);
    } finally {
      // 최종적으로 로딩 상태 해제
      this.sendLoading(webview, false);
    }

    return true;
  }

  private sendLoading(webview: vscode.Webview, loading: boolean): void {
    webview.postMessage({
      type: 'LOADING',
      payload: { target: 'RECOMMEND_PR', loading },
    } as OutboundMessage);
  }

  private sendError(webview: vscode.Webview, code: ErrorCode, message: string): void {
    webview.postMessage({
      type: 'ERROR',
      payload: { code, message },
    } as OutboundMessage);
  }
}
