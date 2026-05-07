import * as vscode from 'vscode';
import type { ErrorCode, OutboundMessage } from '@gitcat/shared-types';
import { CommitRecommendationRequestSchema } from './CommitRecommendationDto';
import { CommitRecommendationService } from './CommitRecommendationService';

/**
 * 커밋 메시지 추천 요청 전용 Webview 메시지 핸들러
 * payload 검증, 로딩 상태 전송, 서비스 호출, 성공/실패 응답 전송 담당
 */
export class CommitRecommendationMessageHandler {
  constructor(private readonly service: CommitRecommendationService) {}

  // 요청 메시지 타입 검증
  public async handle(type: string, payload: unknown, webview: vscode.Webview): Promise<boolean> {
    if (type !== 'RECOMMEND_COMMIT') {
      return false;
    }

    // 요청 payload DTO 검증
    const parseResult = CommitRecommendationRequestSchema.safeParse(payload);
    if (!parseResult.success) {
      this.postError(
        webview,
        'INVALID_PARAMETER',
        parseResult.error.issues[0]?.message ?? '커밋 추천 요청이 올바르지 않습니다.',
      );
      return true;
    }

    // webview 로딩 상태 전송
    this.postLoading(webview, true);

    // 서비스 호출 및 결과 응답 전송
    try {
      const result = await this.service.recommendCommit(parseResult.data);
      webview.postMessage({
        type: 'COMMIT_SUGGESTIONS',
        payload: { suggestions: result.suggestions },
      } as OutboundMessage);

      // AI 응답 경고 메시지 알림 전송
      if (result.warnings.length > 0) {
        webview.postMessage({
          type: 'NOTIFICATION',
          payload: { type: 'info', message: result.warnings[0] },
        } as OutboundMessage);
      }
    } catch (error) {
      // AI 요청 실패 에러 메시지 전송
      const message = error instanceof Error ? error.message : String(error);
      this.postError(webview, 'AI_REQUEST_FAILED', message);
    } finally {
      // 최종 로딩 상태 해제
      this.postLoading(webview, false);
    }

    return true;
  }

  private postLoading(webview: vscode.Webview, loading: boolean): void {
    webview.postMessage({
      type: 'LOADING',
      payload: { target: 'commitRecommendation', loading },
    } as OutboundMessage);
  }

  private postError(webview: vscode.Webview, code: ErrorCode, message: string): void {
    webview.postMessage({
      type: 'ERROR',
      payload: { code, message },
    } as OutboundMessage);
  }
}
