/**
 * MessageRouter ??Webview ??Extension Host 메시지 ?�우?? *
 * Webview?�서 ?�신??InboundMessage�?type�??�들?�로 분기?�다.
 * 1?�계: Git 관??메시지??GitMessageHandler가 ?�당?�다.
 * 미구???�들??추천, ?�냅?? 병합 분석)??stub ?�답??반환?�다.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { GitMessageHandler } from '../features/git/GitMessageHandler';
import type {
  BranchRecommendationMessageHandler,
  CommitRecommendationMessageHandler,
} from '../features/recommendation';
import type { PrRecommendationHandler } from '../features/recommendation/PrRecommendationHandler';
import type { AiApiKeyMessageHandler } from '../features/recommendation/AiApiKeyMessageHandler';
import type { PullRequestMessageHandler } from '../features/pull-request/PullRequestMessageHandler';
import type { PrSettingsMessageHandler } from '../features/settings/PrSettingsMessageHandler';
import type { MergeConflictMessageHandler } from '../features/merge-analysis/MergeConflictMessageHandler';
import type { MergeProposalMessageHandler } from '../features/merge-analysis/MergeProposalMessageHandler';
import type { SnapshotQueryService } from '../features/safety/snapshot/SnapshotQueryService';
import type { ISnapshotService } from '../features/safety/snapshot/ISnapshotService';
import type { RestoreHistoryQueryService } from '../features/safety/snapshot/RestoreHistoryQueryService';
import type { RestoreService, RestoreSnapshotResult } from '../features/safety/snapshot/RestoreService';
import type { SafetySessionCoordinator } from '../features/safety/session/SafetySessionCoordinator';
import {
  InboundMessage,
  InboundMessageSchema,
  OutboundMessage,
  ErrorCode
} from '@gitcat/shared-types';

/**
 * Webview?�서 ?�는 모든 메시지�?중앙?�서 검증하�?�??�들?�로 분기?�는 ?�우?�입?�다.
 */
export class MessageRouter {
  private readonly gitHandler: GitMessageHandler | null;
  private branchRecommendationHandler: BranchRecommendationMessageHandler | null;
  private commitRecommendationHandler: CommitRecommendationMessageHandler | null;
  private prRecommendationHandler: PrRecommendationHandler | null;
  /** GitHub PR ?�성 ?�들??(CREATE_PR, OPEN_PR_PANEL) */
  private readonly pullRequestHandler: PullRequestMessageHandler | null;
  /** PR ?�경?�정 (기본 target 브랜�??�??조회) */
  private prSettingsHandler: PrSettingsMessageHandler | null;
  /** 병합 충돌 분석 메시지 ?�들??*/
  private mergeConflictHandler: MergeConflictMessageHandler | null;
  /** AI 병합 ?�안/?�드�?메시지 ?�들??*/
  private mergeProposalHandler: MergeProposalMessageHandler | null;
  private readonly aiApiKeyMessageHandler: AiApiKeyMessageHandler | null;
  private snapshotQueryService: SnapshotQueryService | null = null;
  private snapshotService: ISnapshotService | null = null;
  private restoreService: RestoreService | null = null;
  private restoreHistoryQueryService: RestoreHistoryQueryService | null = null;
  private safetySessionCoordinator: SafetySessionCoordinator | null = null;
  private readonly webviews = new Set<vscode.Webview>();

  constructor(
    private readonly dbInstance: any,
    gitHandler?: GitMessageHandler,
    branchRecommendationHandler?: BranchRecommendationMessageHandler,
    commitRecommendationHandler?: CommitRecommendationMessageHandler,
    prRecommendationHandler?: PrRecommendationHandler,
    pullRequestHandler?: PullRequestMessageHandler,
    prSettingsHandler?: PrSettingsMessageHandler,
    aiApiKeyMessageHandler?: AiApiKeyMessageHandler,
  ) {
    this.gitHandler = gitHandler ?? null;
    this.branchRecommendationHandler = branchRecommendationHandler ?? null;
    this.commitRecommendationHandler = commitRecommendationHandler ?? null;
    this.prRecommendationHandler = prRecommendationHandler ?? null;
    this.pullRequestHandler = pullRequestHandler ?? null;
    this.prSettingsHandler = prSettingsHandler ?? null;
    this.mergeConflictHandler = null;
    this.mergeProposalHandler = null;
    this.aiApiKeyMessageHandler = aiApiKeyMessageHandler ?? null;
  }

  public setPrSettingsHandler(handler: PrSettingsMessageHandler): void {
    this.prSettingsHandler = handler;
  }

  public setMergeConflictHandler(handler: MergeConflictMessageHandler): void {
    this.mergeConflictHandler = handler;
  }

  public setMergeProposalHandler(handler: MergeProposalMessageHandler): void {
    this.mergeProposalHandler = handler;
  }

  public setSnapshotQueryService(service: SnapshotQueryService): void {
    this.snapshotQueryService = service;
  }

  public setSnapshotService(service: ISnapshotService): void {
    this.snapshotService = service;
  }

  public setRestoreService(service: RestoreService): void {
    this.restoreService = service;
  }

  public setRestoreHistoryQueryService(service: RestoreHistoryQueryService): void {
    this.restoreHistoryQueryService = service;
  }

  public setSafetySessionCoordinator(coordinator: SafetySessionCoordinator): void {
    this.safetySessionCoordinator = coordinator;
  }

  public configureRecommendationHandlers(handlers: {
    branchRecommendationHandler?: BranchRecommendationMessageHandler;
    commitRecommendationHandler?: CommitRecommendationMessageHandler;
    prRecommendationHandler?: PrRecommendationHandler;
  }): void {
    if (handlers.branchRecommendationHandler) {
      this.branchRecommendationHandler = handlers.branchRecommendationHandler;
    }
    if (handlers.commitRecommendationHandler) {
      this.commitRecommendationHandler = handlers.commitRecommendationHandler;
    }
    if (handlers.prRecommendationHandler) {
      this.prRecommendationHandler = handlers.prRecommendationHandler;
    }
  }

  public registerWebview(webview: vscode.Webview): vscode.Disposable {
    this.webviews.add(webview);
    return new vscode.Disposable(() => {
      this.webviews.delete(webview);
    });
  }

  public broadcast(message: OutboundMessage | { type: string; payload?: unknown }): void {
    for (const webview of this.webviews) {
      webview.postMessage(message).then(
        undefined,
        (error) => console.warn('[GitCat] Failed to post message to webview:', error),
      );
    }
  }

  public async route(rawMessage: any, webview: vscode.Webview) {
    const parseResult = InboundMessageSchema.safeParse(rawMessage);

    if (!parseResult.success) {
      console.error('[GitCat] Invalid inbound message:', parseResult.error);
      this.postError(webview, 'INVALID_PARAMETER', `메시지 규격???�바르�? ?�습?�다: ${parseResult.error.message}`);
      return;
    }

    const message = parseResult.data as InboundMessage;
    // console.log(`[GitCat] Processing message: ${message.type}`, message.payload);

    try {
      // Git ?�들?�에 ?�선 ?�임
      if (this.gitHandler) {
        const handled = await this.gitHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // branch 추천 ?�들???�임
      if (this.branchRecommendationHandler) {
        const handled = await this.branchRecommendationHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // commit 추천 ?�들???�임
      if (this.commitRecommendationHandler) {
        const handled = await this.commitRecommendationHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // PR 추천 ?�들???�임
      if (this.prRecommendationHandler) {
        const handled = await this.prRecommendationHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // GitHub PR ?�성 ?�들???�임 (CREATE_PR, OPEN_PR_PANEL)
      if (this.pullRequestHandler) {
        const handled = await this.pullRequestHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // PR ?�경?�정 ?�들???�임 (GET/SET/CLEAR_PR_DEFAULT_BASE_BRANCH)
      if (this.prSettingsHandler) {
        const handled = await this.prSettingsHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // 병합 충돌 분석 ?�들???�임
      if (this.mergeConflictHandler) {
        const handled = await this.mergeConflictHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // AI 병합 ?�안/?�드�??�들???�임
      if (this.mergeProposalHandler) {
        const handled = await this.mergeProposalHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // AI API Key ?�들???�임
      if (this.aiApiKeyMessageHandler) {
        const handled = await this.aiApiKeyMessageHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }

      // ?�들?��? ?�거??처리 �???메시지 ??type�?분기
      switch (message.type) {
        // ?�?�?� ?�냅??관??(3?�계 구현) ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
        case 'GET_SNAPSHOT_LIST':
          await this.handleGetSnapshotList(message, webview);
          break;

        case 'CREATE_SNAPSHOT':
          await this.handleCreateSnapshot(message, webview);
          break;

        case 'DELETE_SNAPSHOT':
          await this.handleDeleteSnapshot(message, webview);
          break;

        case 'RESTORE_SNAPSHOT':
          await this.handleRestoreSnapshot(message, webview);
          break;
        case 'CONFIRM_RESTORE_SNAPSHOT':
          await this.handleConfirmRestoreSnapshot(message, webview);
          break;

        case 'RENAME_SNAPSHOT':
          this.sendNotImplemented(webview, 'RENAME_SNAPSHOT', '?�냅???�름 변�?(3?�계 구현 ?�정)');
          break;

        case 'TOGGLE_SNAPSHOT_STAR':
          this.sendNotImplemented(webview, 'TOGGLE_SNAPSHOT_STAR', '체크?�인??지??(3?�계 구현 ?�정)');
          break;

        case 'GET_SNAPSHOT_FILES':
          await this.handleGetSnapshotFiles(message, webview);
          break;

        case 'GET_SNAPSHOT_DETAIL':
          await this.handleGetSnapshotDetail(message, webview);
          break;

        case 'GET_SNAPSHOT_FILE_DIFF':
          await this.handleGetSnapshotFileDiff(message, webview);
          break;

        case 'GET_RESTORE_HISTORY':
          await this.handleGetRestoreHistory(message, webview);
          break;

        // ?�?�?� 추천 관??(2?�계 구현) ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
        case 'RECOMMEND_COMMIT':
          this.sendNotImplemented(webview, 'RECOMMEND_COMMIT', '커밋 메시지 추천 (2?�계 구현 ?�정)');
          break;

        case 'RECOMMEND_BRANCH':
          this.postError(webview, 'INTERNAL_ERROR', '브랜�?추천 ?�들?��? 초기?�되지 ?�았?�니??');
          break;

        case 'RECOMMEND_PR':
          this.sendNotImplemented(webview, 'RECOMMEND_PR', 'PR ?�명 추천 ?�들?��? ?�록?��? ?�았?�니??');
          break;

        case 'APPLY_COMMIT':
          this.sendNotImplemented(webview, 'APPLY_COMMIT', '추천 커밋 ?�용 (Git ?�들???�음)');
          break;

        // ?�?�?� 병합 분석 관??(4?�계 구현) ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

        case 'ACCEPT_MERGE':
          this.sendNotImplemented(webview, 'ACCEPT_MERGE', '병합???�락 (4?�계 구현 ?�정)');
          break;

        case 'REJECT_MERGE':
          this.sendNotImplemented(webview, 'REJECT_MERGE', '병합??거절 (4?�계 구현 ?�정)');
          break;

        case 'GET_AI_DRAFT':
          this.sendNotImplemented(webview, 'GET_AI_DRAFT', 'AI 초안 조회 (4?�계 구현 ?�정)');
          break;

        // ?�?�?� ?�틸리티 ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
        case 'OPEN_FILE_DIFF':
          await this.handleOpenFileDiff((message.payload as any));
          break;

        case 'GET_WORKSPACE_TREE':
          await this.handleGetWorkspaceTree(webview);
          break;

        case 'OPEN_WORKSPACE_FILE':
          await this.handleOpenWorkspaceFile((message.payload as any));
          break;

        case 'OPEN_DIFF_EDITOR':
          vscode.window.showInformationMessage(
            `GitCat: Diff ?�디???�기 ??${(message.payload as any).filePath}`,
          );
          break;

        case 'SET_CONFIG':
          console.log('[GitCat] SET_CONFIG received', message.payload);
          break;

        // ?�?�?� Git 관??(GitHandler가 ?�을 ?�의 기본 ?�답) ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
        case 'GET_BRANCH_LIST':
          webview.postMessage({ type: 'BRANCH_LIST', payload: { branches: [] } });
          break;

        case 'REFRESH_STATUS':
          webview.postMessage({
            type: 'GIT_STATUS_UPDATED',
            payload: { branch: '', isClean: true, staged: [], unstaged: [] }
          });
          break;

        default:
          console.warn(`[GitCat] Unhandled message type: ${message.type}`);
          this.postError(webview, 'INTERNAL_ERROR', `Unhandled message type: ${message.type}`);
      }
    } catch (error: any) {
      console.error(`[GitCat] Error handling message ${message.type}:`, error);
      this.postError(webview, 'INTERNAL_ERROR', error?.message ?? String(error));
    }
  }

  // ?�?�?� Helpers ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

  private async handleOpenFileDiff(payload: { filePath: string; snapshotId?: string }) {
    vscode.window.showInformationMessage(`GitCat: ?�일 비교 ?�청 ??${payload.filePath}`);
  }

  private async handleGetSnapshotList(message: InboundMessage, webview: vscode.Webview): Promise<void> {
    const service = this.requireSnapshotQueryService();
    const payload = message.payload as { limit?: number; offset?: number };
    const result = await service.listSnapshots(payload);

    await webview.postMessage({
      type: 'SNAPSHOT_LIST',
      payload: result,
      requestId: message.requestId,
    } as OutboundMessage);
  }

  private async handleGetSnapshotFiles(message: InboundMessage, webview: vscode.Webview): Promise<void> {
    const service = this.requireSnapshotQueryService();
    const payload = message.payload as { snapshotId: string };
    const detail = await service.getSnapshotDetail(payload.snapshotId);

    await webview.postMessage({
      type: 'SNAPSHOT_DETAIL',
      payload: { detail },
      requestId: message.requestId,
    } as OutboundMessage);
  }

  private async handleDeleteSnapshot(message: InboundMessage, webview: vscode.Webview): Promise<void> {
    const service = this.requireSnapshotService();
    const queryService = this.requireSnapshotQueryService();
    const payload = message.payload as { snapshotId: string };

    await service.deleteSnapshot(payload.snapshotId);

    await webview.postMessage({
      type: 'NOTIFICATION',
      payload: { type: 'info', message: 'Snapshot deleted.' },
      requestId: message.requestId,
    } as OutboundMessage);

    const result = await queryService.listSnapshots();
    await webview.postMessage({
      type: 'SNAPSHOT_LIST',
      payload: result,
      requestId: message.requestId,
    } as OutboundMessage);
  }

  private async handleCreateSnapshot(message: InboundMessage, webview: vscode.Webview): Promise<void> {
    const snapshotService = this.requireSnapshotService();
    const queryService = this.requireSnapshotQueryService();
    const payload = (message.payload as { title?: string }) ?? {};
    const title = payload.title?.trim();

    const snapshotId = this.safetySessionCoordinator
      ? await this.safetySessionCoordinator.createManualSnapshot(title)
      : await snapshotService.createSnapshot('savepoint', {
        reason: title || 'Manual snapshot',
        force: true,
      });

    await webview.postMessage({
      type: 'NOTIFICATION',
      payload: {
        type: 'info',
        message: snapshotId ? 'Manual snapshot created.' : 'Manual snapshot skipped.',
      },
      requestId: message.requestId,
    } as OutboundMessage);

    const result = await queryService.listSnapshots();
    await webview.postMessage({
      type: 'SNAPSHOT_LIST',
      payload: result,
      requestId: message.requestId,
    } as OutboundMessage);
  }

  private async handleGetSnapshotDetail(message: InboundMessage, webview: vscode.Webview): Promise<void> {
    const service = this.requireSnapshotQueryService();
    const payload = message.payload as { snapshotId: string };
    const detail = await service.getSnapshotDetail(payload.snapshotId);

    await webview.postMessage({
      type: 'SNAPSHOT_DETAIL',
      payload: { detail },
      requestId: message.requestId,
    } as OutboundMessage);
  }

  private async handleGetSnapshotFileDiff(message: InboundMessage, webview: vscode.Webview): Promise<void> {
    const service = this.requireSnapshotQueryService();
    const payload = message.payload as { snapshotId: string; filePath: string };
    const result = await service.getSnapshotFileDiff(payload.snapshotId, payload.filePath);

    await webview.postMessage({
      type: 'SNAPSHOT_FILE_DIFF',
      payload: result,
      requestId: message.requestId,
    } as OutboundMessage);
  }

  private async handleRestoreSnapshot(message: InboundMessage, webview: vscode.Webview): Promise<void> {
    const service = this.requireRestoreService();
    const payload = message.payload as { snapshotId: string };

    const openFileDocuments = this.getOpenFileDocuments();
    const dirtyDocuments = openFileDocuments.filter((doc) => doc.isDirty);
    const restoreApproved = await this.confirmRestoreWithDirtyEditors(dirtyDocuments);
    if (!restoreApproved) {
      await webview.postMessage({
        type: 'NOTIFICATION',
        payload: {
          type: 'warning',
          message: 'Restore cancelled. Save or discard unsaved changes before retrying if needed.',
        },
        requestId: message.requestId,
      } as OutboundMessage);
      return;
    }

    const preview = await service.previewRestoreWarnings(payload.snapshotId);
    if (preview.beforeWarnings.length > 0) {
      await webview.postMessage({
        type: 'RESTORE_CONFIRM_REQUIRED',
        payload: {
          snapshotId: payload.snapshotId,
          changedPathsCount: preview.changedPathsCount,
          warningMessages: preview.beforeWarnings.map((warning) => warning.message),
        },
        requestId: message.requestId,
      } as OutboundMessage);
      return;
    }

    await this.performRestoreSnapshot(payload.snapshotId, webview, message.requestId);
  }

  private async handleConfirmRestoreSnapshot(message: InboundMessage, webview: vscode.Webview): Promise<void> {
    const payload = message.payload as { snapshotId: string; confirmed: boolean };
    if (!payload.confirmed) {
      await webview.postMessage({
        type: 'NOTIFICATION',
        payload: { type: 'info', message: 'Snapshot restore cancelled.' },
        requestId: message.requestId,
      } as OutboundMessage);
      return;
    }

    await this.performRestoreSnapshot(payload.snapshotId, webview, message.requestId);
  }

  private async performRestoreSnapshot(
    snapshotId: string,
    webview: vscode.Webview,
    requestId?: string,
  ): Promise<void> {
    const service = this.requireRestoreService();
    const snapshotService = this.requireSnapshotService();
    const snapshotQueryService = this.requireSnapshotQueryService();
    const restoreHistoryService = this.requireRestoreHistoryQueryService();
    const openFileDocuments = this.getOpenFileDocuments();

    snapshotService.beginRestoreOperation();
    let result: RestoreSnapshotResult;
    try {
      result = await service.restoreToSnapshot(snapshotId);
      console.log(
        `[GitCat][Restore] restoreToSnapshot success: snapshotId=${snapshotId}, ` +
        `preRestoreSnapshotId=${result.preRestoreSnapshotId ?? 'none'}, ` +
        `changedPaths=${result.changedPaths.length}, paths=${this.formatPathListForLog(result.changedPaths)}`,
      );

      await this.reloadOpenEditorsAfterRestore(openFileDocuments, result.changedPaths);

      this.safetySessionCoordinator?.resetAfterRestore();
    } finally {
      snapshotService.endRestoreOperation();
    }

    await webview.postMessage({
      type: 'RESTORE_DONE',
      payload: {
        snapshotId: result.snapshotId,
        preRestoreSnapshotId: result.preRestoreSnapshotId,
        changedPaths: result.changedPaths,
        beforeWarnings: result.beforeWarnings,
        afterWarnings: result.afterWarnings,
      },
      requestId,
    } as OutboundMessage);

    const [snapshots, histories] = await Promise.all([
      snapshotQueryService.listSnapshots(),
      restoreHistoryService.listHistory(),
    ]);

    await webview.postMessage({
      type: 'SNAPSHOT_LIST',
      payload: snapshots,
      requestId,
    } as OutboundMessage);

    await webview.postMessage({
      type: 'RESTORE_HISTORY_LIST',
      payload: { histories },
      requestId,
    } as OutboundMessage);
  }
  private async handleGetRestoreHistory(message: InboundMessage, webview: vscode.Webview): Promise<void> {
    const service = this.requireRestoreHistoryQueryService();
    const histories = await service.listHistory();

    await webview.postMessage({
      type: 'RESTORE_HISTORY_LIST',
      payload: { histories },
      requestId: message.requestId,
    } as OutboundMessage);
  }

  private formatPathListForLog(paths: readonly string[], maxCount = 5): string {
    if (paths.length === 0) {
      return 'none';
    }

    const visible = paths.slice(0, maxCount).join(', ');
    const remaining = paths.length - maxCount;
    return remaining > 0 ? `${visible}, ...and ${remaining} more` : visible;
  }

  private async confirmRestoreWithDirtyEditors(
    dirtyDocuments: readonly vscode.TextDocument[],
  ): Promise<boolean> {
    if (dirtyDocuments.length === 0) {
      return true;
    }

    const samplePaths = dirtyDocuments
      .slice(0, 3)
      .map((doc) => {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
        return workspaceFolder
          ? path.relative(workspaceFolder.uri.fsPath, doc.uri.fsPath).replace(/\\/g, '/')
          : doc.uri.fsPath;
      });
    const extraCount = Math.max(0, dirtyDocuments.length - samplePaths.length);
    const detail = extraCount > 0
      ? `${samplePaths.join(', ')} and ${extraCount} more`
      : samplePaths.join(', ');

    const restoreAction = 'Restore Anyway';
    const selection = await vscode.window.showWarningMessage(
      `There are unsaved changes in open editors (${detail}). ` +
      'Restoring a snapshot may make the editor view differ from files on disk until you save or undo those edits.',
      {
        modal: true,
        detail: 'Save or discard unsaved editor changes first if you want the restored snapshot to be reflected immediately in the editor.',
      },
      restoreAction,
      'Cancel',
    );

    return selection === restoreAction;
  }

  private getOpenFileDocuments(): vscode.TextDocument[] {
    return vscode.workspace.textDocuments.filter((doc) =>
      doc.uri.scheme === 'file',
    );
  }

  private async reloadOpenEditorsAfterRestore(
    openDocuments: readonly vscode.TextDocument[],
    changedPaths: readonly string[],
  ): Promise<void> {
    const previouslyActiveEditor = vscode.window.activeTextEditor;
    const changedPathSet = new Set(
      changedPaths.map((changedPath) => path.resolve(this.getWorkspaceRootForMessageRouter(), changedPath)),
    );

    for (const document of openDocuments) {
      if (!changedPathSet.has(path.resolve(document.uri.fsPath))) {
        continue;
      }

      const editor = await vscode.window.showTextDocument(document, {
        preserveFocus: false,
        preview: false,
      });

      await vscode.commands.executeCommand('workbench.action.files.revert');

      if (editor.document.isDirty) {
        throw new Error(`Failed to reload restored file in editor: ${document.uri.fsPath}`);
      }
    }

    if (previouslyActiveEditor) {
      await vscode.window.showTextDocument(previouslyActiveEditor.document, previouslyActiveEditor.viewColumn, true);
    }
  }

  private getWorkspaceRootForMessageRouter(): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error('Workspace folder is required to resolve restored file paths.');
    }
    return workspaceRoot;
  }

  private async handleGetWorkspaceTree(webview: vscode.Webview): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      webview.postMessage({
        type: 'WORKSPACE_TREE',
        payload: { tree: { rootName: 'No workspace', nodes: [], totalFiles: 0, truncated: false } },
      });
      return;
    }

    const maxFiles = 1200;
    const exclude = '{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/.vscode/gitcat/**,**/.next/**,**/coverage/**}';
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*'), exclude, maxFiles);
    const rootName = path.basename(folder.uri.fsPath) || folder.name;
    const nodes = this.buildWorkspaceTree(
      files
        .map((uri) => path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, '/'))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    );

    webview.postMessage({
      type: 'WORKSPACE_TREE',
      payload: {
        tree: {
          rootName,
          nodes,
          totalFiles: files.length,
          truncated: files.length >= maxFiles,
        },
      },
    });
  }

  private buildWorkspaceTree(filePaths: string[]) {
    type Node = {
      name: string;
      path: string;
      type: 'file' | 'directory';
      children?: Node[];
    };

    const root: Node[] = [];
    const directoryMap = new Map<string, Node[]>();
    directoryMap.set('', root);

    for (const filePath of filePaths) {
      const segments = filePath.split('/').filter(Boolean);
      let currentPath = '';

      segments.forEach((segment, index) => {
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        const siblings = directoryMap.get(parentPath) ?? root;
        const isFile = index === segments.length - 1;

        if (isFile) {
          if (!siblings.some((node) => node.path === currentPath)) {
            siblings.push({ name: segment, path: currentPath, type: 'file' });
          }
          return;
        }

        let directory = siblings.find((node) => node.path === currentPath && node.type === 'directory');
        if (!directory) {
          directory = { name: segment, path: currentPath, type: 'directory', children: [] };
          siblings.push(directory);
        }
        if (!directoryMap.has(currentPath)) {
          directoryMap.set(currentPath, directory.children ?? []);
        }
      });
    }

    const sortNodes = (nodes: Node[]) => {
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      nodes.forEach((node) => {
        if (node.children) sortNodes(node.children);
      });
    };
    sortNodes(root);

    return root;
  }

  private async handleOpenWorkspaceFile(payload: { filePath: string; status?: string }): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;

    if (payload.status === 'DELETED') {
      vscode.window.showInformationMessage(`GitCat: ${payload.filePath} is deleted in the working tree.`);
      return;
    }

    const rootPath = path.resolve(folder.uri.fsPath);
    const targetPath = path.resolve(rootPath, payload.filePath);
    const isInsideWorkspace = targetPath === rootPath || targetPath.startsWith(`${rootPath}${path.sep}`);
    if (!isInsideWorkspace) {
      throw new Error('Cannot open a file outside the workspace.');
    }

    const targetUri = vscode.Uri.file(targetPath);
    await vscode.commands.executeCommand('vscode.open', targetUri, {
      preview: true,
      preserveFocus: false,
    });
  }

  private sendNotImplemented(webview: vscode.Webview, type: string, description: string) {
    console.log(`[GitCat] Not implemented yet: ${type} ??${description}`);
    webview.postMessage({
      type: 'NOTIFICATION',
      payload: { type: 'info', message: `${description}` },
    });
  }

  private postError(webview: vscode.Webview, code: ErrorCode, message: string) {
    webview.postMessage({
      type: 'ERROR',
      payload: { code, message }
    } as OutboundMessage);
  }

  private requireSnapshotQueryService(): SnapshotQueryService {
    if (!this.snapshotQueryService) {
      throw new Error('SnapshotQueryService is not initialized.');
    }

    return this.snapshotQueryService;
  }

  private requireSnapshotService(): ISnapshotService {
    if (!this.snapshotService) {
      throw new Error('SnapshotService is not initialized.');
    }

    return this.snapshotService;
  }

  private requireRestoreService(): RestoreService {
    if (!this.restoreService) {
      throw new Error('RestoreService is not initialized.');
    }

    return this.restoreService;
  }

  private requireRestoreHistoryQueryService(): RestoreHistoryQueryService {
    if (!this.restoreHistoryQueryService) {
      throw new Error('RestoreHistoryQueryService is not initialized.');
    }

    return this.restoreHistoryQueryService;
  }
}
