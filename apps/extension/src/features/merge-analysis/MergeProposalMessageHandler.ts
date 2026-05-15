import * as vscode from 'vscode';
import {
  AcceptMergeRequestSchema,
  GetAiDraftRequestSchema,
  RejectMergeRequestSchema,
  type OutboundMessage,
} from '@gitcat/shared-types';
import { MergeProposalService } from './MergeProposalService';

/**
 * AI 병합 제안과 사용자 피드백 메시지를 처리합니다.
 *
 * 실제 merge 실행 명령은 기존 GitMessageHandler 흐름을 재사용하고,
 * 이 핸들러는 제안 조회, 수락/거절 피드백 저장, 수락 결과 상태 전달까지만 담당합니다.
 */
export class MergeProposalMessageHandler {
  constructor(private readonly service: MergeProposalService) {}

  async handle(type: string, payload: unknown, webview: vscode.Webview): Promise<boolean> {
    switch (type) {
      case 'GET_AI_DRAFT':
        await this.handleGetAiDraft(payload, webview);
        return true;
      case 'ACCEPT_MERGE':
        await this.handleAcceptMerge(payload, webview);
        return true;
      case 'REJECT_MERGE':
        await this.handleRejectMerge(payload, webview);
        return true;
      default:
        return false;
    }
  }

  private async handleGetAiDraft(payload: unknown, webview: vscode.Webview): Promise<void> {
    webview.postMessage({ type: 'LOADING', payload: { target: 'mergeProposal', loading: true } });
    try {
      const request = GetAiDraftRequestSchema.parse(payload);
      const result = await this.service.getDraft(request);
      webview.postMessage({
        type: 'MERGE_PROPOSAL',
        payload: { proposals: result.proposals },
      });
    } catch (error) {
      this.postError(webview, error);
    } finally {
      webview.postMessage({ type: 'LOADING', payload: { target: 'mergeProposal', loading: false } });
    }
  }

  private async handleAcceptMerge(payload: unknown, webview: vscode.Webview): Promise<void> {
    try {
      const request = AcceptMergeRequestSchema.parse(payload);
      const result = await this.service.accept(request);
      webview.postMessage({
        type: 'NOTIFICATION',
        payload: {
          type: result.merge?.status === 'conflicted' ? 'warning' : 'info',
          message: `병합 제안을 수락했습니다. feedbackId=${result.feedbackId}`,
        },
      });

      if (result.merge) {
        webview.postMessage({
          type: 'MERGE_COMPLETE',
          payload: { merge: result.merge },
        });
      }
      if (result.gitStatus) {
        webview.postMessage({
          type: 'GIT_STATUS_UPDATED',
          payload: { status: result.gitStatus },
        });
      }
    } catch (error) {
      this.postError(webview, error);
    }
  }

  private async handleRejectMerge(payload: unknown, webview: vscode.Webview): Promise<void> {
    try {
      const request = RejectMergeRequestSchema.parse(payload);
      const result = await this.service.reject(request);
      webview.postMessage({
        type: 'NOTIFICATION',
        payload: {
          type: 'info',
          message: `병합 제안을 거절했습니다. feedbackId=${result.feedbackId}`,
        },
      });
    } catch (error) {
      this.postError(webview, error);
    }
  }

  private postError(webview: vscode.Webview, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    webview.postMessage({
      type: 'ERROR',
      payload: {
        code: 'INTERNAL_ERROR',
        message,
      },
    } as OutboundMessage);
  }
}
