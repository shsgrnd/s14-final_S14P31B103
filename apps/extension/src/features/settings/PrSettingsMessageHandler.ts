/**
 * PrSettingsMessageHandler — PR 환경설정(기본 target 브랜치 등) 관련 메시지 핸들러
 *
 * 처리 메시지:
 * - GET_PR_DEFAULT_BASE_BRANCH:  workspaceState에서 읽어 호출한 webview에 PR_DEFAULT_BASE_BRANCH 응답
 * - SET_PR_DEFAULT_BASE_BRANCH:  workspaceState에 저장 후, *모든* 등록된 webview에 broadcast
 * - CLEAR_PR_DEFAULT_BASE_BRANCH: workspaceState 항목 제거 후 broadcast
 *
 * Broadcast가 필수인 이유:
 * - GitCat은 사이드바 webview와 PR Create panel webview가 분리되어 있다.
 * - 사용자는 보통 사이드바에서 값을 바꾸고, 즉시 (또는 곧이어) PR 패널에서 결과를 본다.
 * - 두 webview가 동기화되려면 한쪽의 SET 결과를 양쪽에 알려야 한다.
 */
import * as vscode from 'vscode';
import type { PrSettingsService } from './PrSettingsService';
import type { MessageRouter } from '../../core/MessageRouter';
import { InboundPayloadSchemaMap } from '@gitcat/shared-types';

export class PrSettingsMessageHandler {
  constructor(
    private readonly service: PrSettingsService,
    private readonly messageRouter: MessageRouter,
  ) {}

  async handle(type: string, payload: any, webview: vscode.Webview): Promise<boolean> {
    switch (type) {
      case 'GET_PR_DEFAULT_BASE_BRANCH':
        await this.sendCurrent(webview);
        return true;

      case 'SET_PR_DEFAULT_BASE_BRANCH': {
        const validated = InboundPayloadSchemaMap.SET_PR_DEFAULT_BASE_BRANCH.parse(payload);
        const saved = await this.service.setDefaultBaseBranch(validated.branch);
        this.broadcastCurrent(saved);
        return true;
      }

      case 'CLEAR_PR_DEFAULT_BASE_BRANCH':
        await this.service.clearDefaultBaseBranch();
        this.broadcastCurrent(null);
        return true;

      default:
        return false;
    }
  }

  private async sendCurrent(webview: vscode.Webview): Promise<void> {
    const branch = this.service.getDefaultBaseBranch();
    webview.postMessage({
      type: 'PR_DEFAULT_BASE_BRANCH',
      payload: { branch },
    });
  }

  private broadcastCurrent(branch: string | null): void {
    this.messageRouter.broadcast({
      type: 'PR_DEFAULT_BASE_BRANCH',
      payload: { branch },
    });
  }
}
