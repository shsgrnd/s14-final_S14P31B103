import * as vscode from 'vscode';
import {
  InboundPayloadSchemaMap,
  type ErrorCode,
  type OutboundMessage,
} from '@gitcat/shared-types';
import { AiSecretService } from './AiSecretService';
import { AiRemoteSettingsService } from './AiRemoteSettingsService';
import type { MessageRouter } from '../../core/MessageRouter';

export class AiApiKeyMessageHandler {
  private messageRouter: MessageRouter | null = null;

  constructor(
    private readonly aiSecretService: AiSecretService,
    private readonly aiRemoteSettingsService: AiRemoteSettingsService,
    private readonly onKeyChanged?: () => void,
  ) {}

  public attachMessageRouter(messageRouter: MessageRouter): void {
    this.messageRouter = messageRouter;
  }

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
      const { apiKey, remoteBaseUrl, remoteModel } = parseResult.data;
      if (!apiKey && remoteBaseUrl === undefined && remoteModel === undefined) {
        this.sendError(webview, 'INVALID_PARAMETER', '저장할 AI 설정이 없습니다.');
        return;
      }

      if (apiKey) {
        await this.aiSecretService.saveApiKey(apiKey);
      }
      if (remoteBaseUrl !== undefined || remoteModel !== undefined) {
        await this.aiRemoteSettingsService.saveSettings({
          remoteBaseUrl,
          remoteModel,
        });
      }
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
    const [hasKey, hasStoredKey] = await Promise.all([
      this.aiSecretService.hasApiKey(),
      this.aiSecretService.hasStoredApiKey(),
    ]);
    const remoteSettings = this.aiRemoteSettingsService.getState();
    const message = {
      type: 'AI_API_KEY_STATUS',
      payload: {
        hasKey,
        hasStoredKey,
        remoteBaseUrl: remoteSettings.remoteBaseUrl,
        remoteModel: remoteSettings.remoteModel,
        aiMode: remoteSettings.aiMode,
      },
    } as OutboundMessage;
    if (this.messageRouter) {
      this.messageRouter.broadcast(message);
    } else {
      await webview.postMessage(message);
    }
  }

  private sendError(webview: vscode.Webview, code: ErrorCode, message: string): void {
    webview.postMessage({
      type: 'ERROR',
      payload: { code, message },
    } as OutboundMessage);
  }
}
