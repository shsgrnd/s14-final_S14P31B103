/**
 * MessageRouter — Webview ↔ Extension Host 메시지 라우터
 * 
 * Webview에서 수신한 InboundMessage를 type별 핸들러로 분기한다.
 * 1단계: Git 관련 메시지는 GitMessageHandler가 담당한다.
 * 미구현 핸들러(추천, 스냅샷, 병합 분석)는 stub 응답을 반환한다.
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
import { sanitizeCandidatesForWebview } from '../features/merge-analysis/mergeConflictWebviewPayload';
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
import { t } from '../i18n';

/**
 * Webview에서 오는 모든 메시지를 중앙에서 검증하고 각 핸들러로 분기하는 라우터입니다.
 */
export class MessageRouter {
  private readonly gitHandler: GitMessageHandler | null;
  private branchRecommendationHandler: BranchRecommendationMessageHandler | null;
  private commitRecommendationHandler: CommitRecommendationMessageHandler | null;
  private prRecommendationHandler: PrRecommendationHandler | null;
  /** GitHub PR 생성 핸들러 (CREATE_PR, OPEN_PR_PANEL) */
  private readonly pullRequestHandler: PullRequestMessageHandler | null;
  /** PR 환경설정 (기본 target 브랜치 저장/조회) */
  private prSettingsHandler: PrSettingsMessageHandler | null;
  /** 병합 충돌 분석 메시지 핸들러 */
  private mergeConflictHandler: MergeConflictMessageHandler | null;
  /** AI 병합 제안/피드백 메시지 핸들러 */
  private mergeProposalHandler: MergeProposalMessageHandler | null;
  private readonly aiApiKeyMessageHandler: AiApiKeyMessageHandler | null;
  private snapshotQueryService: SnapshotQueryService | null = null;
  private snapshotService: ISnapshotService | null = null;
  private restoreService: RestoreService | null = null;
  private restoreHistoryQueryService: RestoreHistoryQueryService | null = null;
  private safetySessionCoordinator: SafetySessionCoordinator | null = null;
  private readonly webviews = new Set<vscode.Webview>();

  /** 사이드바 또는 에디터 패널을 연다 (GitCat WebviewProvider.createOrShow('main')). */
  private openMainPanel: (() => void) | null = null;
  /** PR 패널이 현재 열려 있는지 확인 (충돌 시 main 패널 또는 PR 패널을 열지 판단). */
  private isPrPanelOpen: (() => boolean) | null = null;

  /**
   * 에디터 패널이 도중에 열려도 복구되도록 마지막 병합 충돌 페이로드를 저장합니다.
   * (registerWebview 시 새 웹뷰에 재전송)
   */
  private mergeReviewConflictPayload: {
    analysisId?: string;
    artifactPath?: string | null;
    candidates: unknown[];
    triggeringAction?: 'push' | 'pull' | 'pr' | 'merge';
    mergeSource?: string;
    preserveResolvedCandidates?: boolean;
    resolvedCandidates?: Record<string, 'accepted' | 'rejected'>;
    resolvedCandidatesByFilePath?: Record<string, 'accepted' | 'rejected'>;
    appliedFileContents?: Record<string, string>;
  } | null = null;

  private mergeReviewProposalPayload: { proposals: unknown[] } | null = null;

  private mergeReviewResolvedCandidates: Record<string, 'accepted' | 'rejected'> = {};
  private mergeReviewResolvedByFilePath: Record<string, 'accepted' | 'rejected'> = {};
  private mergeReviewAppliedContents: Record<string, string> = {};

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

  public setMainPanelOpener(opener: (() => void) | null, isPrOpen?: () => boolean): void {
    this.openMainPanel = opener;
    this.isPrPanelOpen = isPrOpen ?? null;
  }

  private shouldOpenMainPanelOnMergeConflict(): boolean {
    return vscode.workspace
      .getConfiguration()
      .get<boolean>('gitcat.merge.openMainPanelOnConflict', true);
  }

  /**
   * CONFLICT_RESULT를 모든 GitCat 웹뷰에 브로드캐스트하고, 옵션이 켜져 있으면 메인 패널을 연다.
   */
  public publishConflictResult(payload: {
    analysisId?: string;
    artifactPath?: string | null;
    candidates: unknown[];
    triggeringAction?: 'push' | 'pull' | 'pr' | 'merge';
    mergeSource?: string;
    /** @deprecated extension 스냅샷은 clearMergeReviewSnapshot()에서 초기화 */
    preserveResolvedCandidates?: boolean;
  }): void {
    const hasResolved =
      Object.keys(this.mergeReviewResolvedCandidates).length > 0
      || Object.keys(this.mergeReviewResolvedByFilePath).length > 0;
    const hasApplied = Object.keys(this.mergeReviewAppliedContents).length > 0;
    const enriched = {
      ...payload,
      candidates: sanitizeCandidatesForWebview(payload.candidates),
      preserveResolvedCandidates: hasResolved || hasApplied || payload.preserveResolvedCandidates === true,
      resolvedCandidates: { ...this.mergeReviewResolvedCandidates },
      resolvedCandidatesByFilePath: { ...this.mergeReviewResolvedByFilePath },
      appliedFileContents: { ...this.mergeReviewAppliedContents },
    };
    this.mergeReviewConflictPayload = enriched;
    this.mergeReviewProposalPayload = null;
    // 현재 열려 있는 웹뷰(사이드바 + 열린 패널)에 즉시 반영
    this.broadcast({ type: 'CONFLICT_RESULT', payload: enriched });
    if (this.shouldOpenMainPanelOnMergeConflict()) {
      try {
        this.openMainPanel?.();
      } catch (e) {
        console.warn('[GitCat] openMainPanel failed:', e);
      }
    }
  }

  public publishMergeProposal(payload: { proposals: unknown[] }): void {
    this.mergeReviewProposalPayload = payload;
    this.broadcast({ type: 'MERGE_PROPOSAL', payload });
  }

  /** 수락/거절 상태를 extension에 보관하고 모든 webview에 동기화 */
  public publishCandidateResolved(payload: {
    candidateId: string;
    filePath: string;
    status: 'accepted' | 'rejected';
  }): void {
    this.mergeReviewResolvedCandidates[payload.candidateId] = payload.status;
    this.mergeReviewResolvedByFilePath[payload.filePath] = payload.status;
    if (payload.status === 'rejected') {
      delete this.mergeReviewAppliedContents[payload.filePath];
    }
    this.syncMergeReviewConflictPayload();
    this.broadcast({ type: 'CANDIDATE_RESOLVED', payload });
  }

  public publishAppliedFileContent(filePath: string, content: string): void {
    this.mergeReviewAppliedContents[filePath] = content;
    this.syncMergeReviewConflictPayload();
  }

  private syncMergeReviewConflictPayload(): void {
    if (!this.mergeReviewConflictPayload) {
      return;
    }
    this.mergeReviewConflictPayload = {
      ...this.mergeReviewConflictPayload,
      preserveResolvedCandidates: true,
      resolvedCandidates: { ...this.mergeReviewResolvedCandidates },
      resolvedCandidatesByFilePath: { ...this.mergeReviewResolvedByFilePath },
      appliedFileContents: { ...this.mergeReviewAppliedContents },
    };
  }

  public clearMergeReviewSnapshot(): void {
    this.mergeReviewConflictPayload = null;
    this.mergeReviewProposalPayload = null;
    this.mergeReviewResolvedCandidates = {};
    this.mergeReviewResolvedByFilePath = {};
    this.mergeReviewAppliedContents = {};
  }

  public publishMergeReviewLoading(target: 'mergeAnalysis' | 'mergeProposal', loading: boolean): void {
    this.broadcast({ type: 'LOADING', payload: { target, loading } });
  }

  private replayMergeReviewSnapshotTo(webview: vscode.Webview): void {
    if (this.mergeReviewConflictPayload) {
      void webview.postMessage({ type: 'CONFLICT_RESULT', payload: this.mergeReviewConflictPayload });
    }
    if (this.mergeReviewProposalPayload) {
      void webview.postMessage({ type: 'MERGE_PROPOSAL', payload: this.mergeReviewProposalPayload });
    }
  }

  public registerWebview(webview: vscode.Webview): vscode.Disposable {
    this.webviews.add(webview);
    this.replayMergeReviewSnapshotTo(webview);
    return new vscode.Disposable(() => {
      this.webviews.delete(webview);
    });
  }

  public broadcast(message: OutboundMessage | { type: string; payload?: unknown }): void {
    for (const webview of this.webviews) {
      webview.postMessage(message).then(
        undefined,
        (error: unknown) => console.warn('[GitCat] Failed to post message to webview:', error),
      );
    }
  }

  public async route(rawMessage: any, webview: vscode.Webview) {
    // 웹뷰 React 마운트 시 registerWebview/replay를 유실하는 경우를 보완합니다.
    if (rawMessage?.type === 'WEBVIEW_READY') {
      this.replayMergeReviewSnapshotTo(webview);
      return;
    }

    // 사이드바 알림 배너의 "에디터에서 검토" 버튼
    if (rawMessage?.type === 'OPEN_MAIN_PANEL') {
      try {
        this.openMainPanel?.();
      } catch (e) {
        console.warn('[GitCat] OPEN_MAIN_PANEL from webview failed:', e);
      }
      return;
    }

    if (rawMessage?.type === 'CLEAR_MERGE_REVIEW_UI') {
      this.clearMergeReviewSnapshot();
      this.broadcast({
        type: 'CONFLICT_RESULT',
        payload: { candidates: [], analysisId: undefined, artifactPath: null },
      });
      return;
    }


    const parseResult = InboundMessageSchema.safeParse(rawMessage);

    if (!parseResult.success) {
      console.error('[GitCat] Invalid inbound message:', parseResult.error);
      this.postError(webview, 'INVALID_PARAMETER', `메시지 규격이 올바르지 않습니다: ${parseResult.error.message}`);
      return;
    }

    const message = parseResult.data as InboundMessage;
    // console.log(`[GitCat] Processing message: ${message.type}`, message.payload);

    try {
      // Git 핸들러에 우선 위임
      if (this.gitHandler) {
        const handled = await this.gitHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // branch 추천 핸들러에 위임
      if (this.branchRecommendationHandler) {
        const handled = await this.branchRecommendationHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // commit 추천 핸들러에 위임
      if (this.commitRecommendationHandler) {
        const handled = await this.commitRecommendationHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // PR 추천 핸들러에 위임
      if (this.prRecommendationHandler) {
        const handled = await this.prRecommendationHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // GitHub PR 생성 핸들러에 위임 (CREATE_PR, OPEN_PR_PANEL)
      if (this.pullRequestHandler) {
        const handled = await this.pullRequestHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // PR 환경설정 핸들러에 위임 (GET/SET/CLEAR_PR_DEFAULT_BASE_BRANCH)
      if (this.prSettingsHandler) {
        const handled = await this.prSettingsHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // 병합 충돌 분석 핸들러에 위임
      if (this.mergeConflictHandler) {
        const handled = await this.mergeConflictHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // AI 병합 제안/피드백 핸들러에 위임
      if (this.mergeProposalHandler) {
        const handled = await this.mergeProposalHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }
      // AI API Key 핸들러에 위임
      if (this.aiApiKeyMessageHandler) {
        const handled = await this.aiApiKeyMessageHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }

      // 핸들러가 처리하지 못한 메시지 type별 분기
      switch (message.type) {
        // 스냅샷 관리 (3단계 구현)
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
          await this.handleRenameSnapshot(message, webview);
          break;

        case 'TOGGLE_SNAPSHOT_STAR':
          this.sendNotImplemented(webview, 'TOGGLE_SNAPSHOT_STAR', '즐겨찾기 기능 (3단계 구현 예정)');
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

        // ================= 추천 기능 (2단계 구현) =================
        case 'RECOMMEND_COMMIT':
          this.sendNotImplemented(webview, 'RECOMMEND_COMMIT', '커밋 메시지 추천 (2단계 구현 예정)');
          break;

        case 'RECOMMEND_BRANCH':
          this.postError(webview, 'INTERNAL_ERROR', '브랜치 추천 핸들러가 초기화되지 않았습니다.');
          break;

        case 'RECOMMEND_PR':
          this.sendNotImplemented(webview, 'RECOMMEND_PR', 'PR 설명 추천 핸들러가 등록되지 않았습니다.');
          break;

        case 'APPLY_COMMIT':
          this.sendNotImplemented(webview, 'APPLY_COMMIT', '추천 커밋 적용 (Git 핸들러가 담당)');
          break;

        // ================= 병합 분석 기능 (4단계 구현) =================
        // ================= 유틸리티 =================
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
            `GitCat: Diff 에디터 열기 대상: ${(message.payload as any).filePath}`,
          );
          break;

        case 'SET_CONFIG':
          console.log('[GitCat] SET_CONFIG received', message.payload);
          await this.handleSetConfig(message.payload as any);
          break;

        // ================= Git 기능 (GitHandler가 없을 때의 기본 응답) =================
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

  // ================= Helpers =================
  private async handleOpenFileDiff(payload: { filePath: string; snapshotId?: string }) {
    vscode.window.showInformationMessage(`GitCat: 파일 비교 요청 대상: ${payload.filePath}`);
  }

  private async handleSetConfig(payload: { config?: { key?: string; value?: unknown } }): Promise<void> {
    const key = payload?.config?.key;
    if (typeof key !== 'string' || !key.startsWith('gitcat.')) {
      return;
    }

    const settingPath = key.slice('gitcat.'.length);
    if (!settingPath) {
      return;
    }

    await vscode.workspace
      .getConfiguration('gitcat')
      .update(settingPath, payload.config?.value, vscode.ConfigurationTarget.Global);
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
    const detail = await this.tryGetSnapshotDetailSafe(service, payload.snapshotId);
    if (!detail) {
      return;
    }

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
        reason: title || t('session.snapshot.manual'),
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

    // Creation callbacks and list refresh can arrive in different orders, so
    // we push the resolved snapshot detail once more to guarantee sidebar
    // summary rows have file and line counts before the user expands the item.
    if (snapshotId) {
      const detail = await this.tryGetSnapshotDetailSafe(queryService, snapshotId);
      if (detail) {
        this.broadcast({
          type: 'SNAPSHOT_DETAIL',
          payload: { detail },
        } as OutboundMessage);
      }
    }

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
    const detail = await this.tryGetSnapshotDetailSafe(service, payload.snapshotId);
    if (!detail) {
      return;
    }

    await webview.postMessage({
      type: 'SNAPSHOT_DETAIL',
      payload: { detail },
      requestId: message.requestId,
    } as OutboundMessage);
  }

  private async handleGetSnapshotFileDiff(message: InboundMessage, webview: vscode.Webview): Promise<void> {
    const service = this.requireSnapshotQueryService();
    const payload = message.payload as { snapshotId: string; filePath: string };
    let result;
    try {
      result = await service.getSnapshotFileDiff(payload.snapshotId, payload.filePath);
    } catch (error) {
      console.warn(
        `[GitCat][Snapshot] file diff unavailable: snapshotId=${payload.snapshotId}, filePath=${payload.filePath}`,
        error,
      );
      result = {
        snapshotId: payload.snapshotId,
        filePath: payload.filePath.replace(/\\/g, '/'),
        diffText: '',
        hunks: [],
      };
    }

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

  private async handleRenameSnapshot(message: InboundMessage, webview: vscode.Webview): Promise<void> {
    const queryService = this.requireSnapshotQueryService();
    const payload = message.payload as { snapshotId?: string; newTitle?: string };
    const snapshotId = payload.snapshotId?.trim();
    const newTitle = payload.newTitle?.trim();

    if (!snapshotId || !newTitle) {
      this.postError(webview, 'INVALID_PARAMETER', 'Snapshot id and title are required.');
      return;
    }

    const snapshotService = this.requireSnapshotService() as any;
    await snapshotService.snapshotRepository.updateSummary(snapshotId, newTitle);
    const detail = await queryService.getSnapshotDetail(snapshotId);
    webview.postMessage({
      type: 'SNAPSHOT_UPDATED',
      payload: { snapshot: detail.meta },
      requestId: message.requestId,
    } as OutboundMessage);
    webview.postMessage({
      type: 'NOTIFICATION',
      payload: { type: 'success', message: `Snapshot renamed: ${newTitle}` },
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
    return vscode.workspace.textDocuments.filter((doc: vscode.TextDocument) =>
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
        .map((uri: vscode.Uri) => path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, '/'))
        .filter(Boolean)
        .sort((a: string, b: string) => a.localeCompare(b)),
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
    console.log(`[GitCat] Not implemented yet: ${type} (${description})`);
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

  private async tryGetSnapshotDetailSafe(
    service: SnapshotQueryService,
    snapshotId: string,
  ): Promise<Awaited<ReturnType<SnapshotQueryService['getSnapshotDetail']>> | null> {
    try {
      return await service.getSnapshotDetail(snapshotId);
    } catch (error) {
      console.warn(`[GitCat][Snapshot] detail unavailable: snapshotId=${snapshotId}`, error);
      return null;
    }
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
