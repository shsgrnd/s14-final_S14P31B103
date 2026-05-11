import * as vscode from 'vscode';
import {
  InboundPayloadSchemaMap,
  type ErrorCode,
  type OutboundMessage,
} from '@gitcat/shared-types';
import { AiSecretService } from './AiSecretService';

export class AiApiKeyMessageHandler {
  constructor(
    private readonly aiSecretService: AiSecretService,
    private readonly onKeyChanged?: () => void,
  ) {}

  public async handle(type: string, payload: unknown, webview: vscode.Webview): Promise<boolean> {
    if (type === 'SAVE_AI_API_KEY') {
      await this.handleSave(payload, webview);
      return true;
    }
    if (type === 'DELETE_AI_API_KEY') {
      await this.handleDelete(webview);
      return true;
    }
    if (type === 'CHECK_AI_API_KEY') {
      await this.handleCheck(webview);
      return true;
    }
    return false;
  }

  private async handleSave(payload: unknown, webview: vscode.Webview): Promise<void> {
    const parseResult = InboundPayloadSchemaMap.SAVE_AI_API_KEY.safeParse(payload);
    if (!parseResult.success) {
      this.sendError(
        webview,
        'INVALID_PARAMETER',
        parseResult.error.issues[0]?.message ?? 'AI API Key 저장을 위한 파라미터가 올바르지 않습니다.',
      );
      return;
    }

    try {
      await this.aiSecretService.saveApiKey(parseResult.data.apiKey);
      this.onKeyChanged?.();
      await this.sendStatus(webview);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendError(webview, 'INTERNAL_ERROR', `API Key 저장 실패: ${message}`);
    }
  }

  private async handleDelete(webview: vscode.Webview): Promise<void> {
    try {
      await this.aiSecretService.deleteApiKey();
      this.onKeyChanged?.();
      await this.sendStatus(webview);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendError(webview, 'INTERNAL_ERROR', `API Key 삭제 실패: ${message}`);
    }
  }

  private async handleCheck(webview: vscode.Webview): Promise<void> {
    try {
      await this.sendStatus(webview);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendError(webview, 'INTERNAL_ERROR', `API Key 상태 확인 실패: ${message}`);
    }
  }

  private async sendStatus(webview: vscode.Webview): Promise<void> {
    const hasKey = await this.aiSecretService.hasApiKey();
    webview.postMessage({
      type: 'AI_API_KEY_STATUS',
      payload: { hasKey },
    } as OutboundMessage);
  }

  private sendError(webview: vscode.Webview, code: ErrorCode, message: string): void {
    webview.postMessage({
      type: 'ERROR',
      payload: { code, message },
    } as OutboundMessage);
  }
}
