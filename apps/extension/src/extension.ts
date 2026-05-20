import * as vscode from 'vscode';
import { createHash } from 'crypto';
import {
  GitCatDatabase,
  SqliteRecommendationHistoryRepository,
  SqliteSnapshotRepository,
  SqliteSnapshotFileRepository,
  SqliteWorkSessionRepository,
  SqliteRestoreHistoryRepository,
  type SQLiteDatabase,
} from '@gitcat/storage';
import { GitCliClient } from '@gitcat/git-client-cli';
import { CommandRegistry } from './commands';
import { EventRegistry } from './events';
import { SafetySessionCoordinator } from './features/safety/session/SafetySessionCoordinator';
import { FallbackSnapshotService } from './features/safety/snapshot/FallbackSnapshotService';
import { SnapshotService } from './features/safety/snapshot/SnapshotService';
import { SnapshotQueryService } from './features/safety/snapshot/SnapshotQueryService';
import { RestoreHistoryQueryService } from './features/safety/snapshot/RestoreHistoryQueryService';
import { RestoreService } from './features/safety/snapshot/RestoreService';
import { ISnapshotService } from './features/safety/snapshot/ISnapshotService';
import { WebviewProvider } from './webview/WebviewProvider';
import { SidebarProvider } from './webview/SidebarProvider';
import { MessageRouter } from './core/MessageRouter';
import { registerGitCatOutputChannel } from './platform/GitCatLog';
import { LiveLocalRuntimeManager } from './platform/LiveLocalRuntimeManager';
import {
  migrateLegacyAiModeSettingIfNeeded,
  normalizeExtensionAiMode,
} from './platform/aiModeConfig';
import { AiSecretService } from './features/recommendation/AiSecretService';
import { AiApiKeyMessageHandler } from './features/recommendation/AiApiKeyMessageHandler';
import { AiRemoteSettingsService } from './features/recommendation/AiRemoteSettingsService';
import { GitService } from './features/git/GitService';
import { GitMessageHandler } from './features/git/GitMessageHandler';
import { GitStatusRefreshController } from './features/git/GitStatusRefreshController';
import { BranchCleanupService } from './features/git/BranchCleanupService';
import { GitHubTokenProvider } from './integrations/github/GitHubTokenProvider';
import { GitHubClient } from './integrations/github/GitHubClient';
import { PullRequestService } from './features/pull-request/PullRequestService';
import { PullRequestMessageHandler } from './features/pull-request/PullRequestMessageHandler';
import { PrSettingsService } from './features/settings/PrSettingsService';
import { PrSettingsMessageHandler } from './features/settings/PrSettingsMessageHandler';
import { resolveLocale, t } from './i18n';
import {
  createMergeRepositories,
  MergeAnalysisArtifactStore,
  AiPipelineMergeProposalProvider,
  MergeConflictAnalysisService,
  MergeConflictGuardService,
  MergeConflictMessageHandler,
  MergeInputAssembler,
  MergeProposalMessageHandler,
  LocalMergeProposalDraftProvider,
  MergeProposalService,
  type MergeProposalProvider,
} from './features/merge-analysis';

export async function activate(context: vscode.ExtensionContext) {
  console.log('GitCat Extension is now active!');
  registerGitCatOutputChannel(context);

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showInformationMessage(t('workspace.openFolderFirst'));
  }

  const rootPath = workspaceFolders?.[0]?.uri.fsPath ?? '';
  const projectId = rootPath
    ? `project_${createHash('sha1').update(rootPath).digest('hex').slice(0, 16)}`
    : undefined;

  let gitMessageHandler: GitMessageHandler | undefined;
  let gitService: GitService | undefined;
  if (rootPath && projectId) {
    try {
      const gitClient = new GitCliClient(rootPath);
      gitService = new GitService(gitClient, undefined, rootPath);

      const branchCleanupService = new BranchCleanupService(gitService);
      gitMessageHandler = new GitMessageHandler(gitService, branchCleanupService);

      console.log('GitCat Git layer initialized at:', rootPath);
    } catch (error) {
      console.error('Failed to initialize GitCat Git layer:', error);
      vscode.window.showWarningMessage(t('git.init.failed'));
    }
  }

  // ――― GitHub PR 생성 계층 초기화 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // GitHub token은 VS Code SecretStorage에만 저장한다. (SQLite/파일 금지)
  let pullRequestHandler: PullRequestMessageHandler | undefined;
  const openPullRequestPanelRef: { current?: () => void } = {};
  const closePullRequestPanelRef: { current?: () => void } = {};
  if (rootPath && gitService) {
    try {
      const tokenProvider = new GitHubTokenProvider(context.secrets);
      const githubClient = new GitHubClient(tokenProvider);
      const pullRequestService = new PullRequestService(githubClient, gitService);
      pullRequestHandler = new PullRequestMessageHandler(
        pullRequestService,
        () => openPullRequestPanelRef.current?.(),
        () => closePullRequestPanelRef.current?.(),
      );
      console.log('GitCat GitHub PR layer initialized');
    } catch (error) {
      console.error('Failed to initialize GitCat GitHub PR layer:', error);
      vscode.window.showWarningMessage(t('github.pr.init.failed'));
    }
  }



  const aiSecretService = new AiSecretService(context.secrets);
  const aiRemoteSettingsService = new AiRemoteSettingsService();
  const liveLocalRuntimeManager = new LiveLocalRuntimeManager(context);
  const aiModeMigrationNotice = await migrateLegacyAiModeSettingIfNeeded(context);
  if (aiModeMigrationNotice) {
    void vscode.window.showWarningMessage(aiModeMigrationNotice);
  }
  void liveLocalRuntimeManager.promptIfLiveLocalNeedsSetup();
  let clearAiCache = () => { };
  const aiApiKeyMessageHandler = new AiApiKeyMessageHandler(
    aiSecretService,
    aiRemoteSettingsService,
    () => clearAiCache(),
  );

  const messageRouter = new MessageRouter(
    null,
    gitMessageHandler,
    undefined,
    undefined,
    undefined,
    pullRequestHandler,  // GitHub PR 생성 핵들러 주입
    undefined,
    aiApiKeyMessageHandler, // AI API Key 핸들러 주입
  );
  aiApiKeyMessageHandler.attachMessageRouter(messageRouter);

  // PR 환경설정 핸들러 — 두 webview가 공유할 기본 target 브랜치 등을 workspaceState에 저장한다.
  const prSettingsService = new PrSettingsService(context.workspaceState);
  const prSettingsHandler = new PrSettingsMessageHandler(prSettingsService, messageRouter);
  messageRouter.setPrSettingsHandler(prSettingsHandler);

  let dbInstance: SQLiteDatabase | undefined;
  if (rootPath && projectId) {
    try {
      const database = await GitCatDatabase.create(rootPath);
      dbInstance = database.getInstance();
      console.log('GitCat Database initialized successfully at:', GitCatDatabase.getDatabasePath(rootPath));
    } catch (error) {
      console.error('Failed to initialize GitCat database:', error);
      vscode.window.showWarningMessage(t('database.init.failed'));
    }
  }

  if (rootPath && projectId && gitService && dbInstance) {
    await initializeMergeConflictAnalysis(
      context,
      gitService,
      dbInstance,
      messageRouter,
      rootPath,
      aiSecretService,
      liveLocalRuntimeManager,
      gitMessageHandler,
      pullRequestHandler,
      prSettingsService,
    );
  }

  let gitStatusRefreshController: GitStatusRefreshController | undefined;
  if (gitService) {
    gitStatusRefreshController = new GitStatusRefreshController(gitService, messageRouter);
    gitStatusRefreshController.start();
    context.subscriptions.push(gitStatusRefreshController);
  }

  const webviewProvider = new WebviewProvider(context, messageRouter);
  messageRouter.setMainPanelOpener(
    () => webviewProvider.createOrShow('main'),
    () => webviewProvider.isPrPanelOpen(),
  );
  gitMessageHandler?.setMessageRouter(messageRouter);
  pullRequestHandler?.setMessageRouter(messageRouter);
  openPullRequestPanelRef.current = () => webviewProvider.createOrShow('pr');
  closePullRequestPanelRef.current = () => webviewProvider.closePrPanel();
  const sidebarProvider = new SidebarProvider(context, messageRouter);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('gitcat-sidebar-webview', sidebarProvider)
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      vscode.window.showInformationMessage(t('workspace.changedReloadRequired'));
    })
  );

  // ――― Safety Layer (Snapshot Service) 초기화 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // DB 초기화 성공 시 실제 SnapshotService, 실패 시 FallbackSnapshotService로 폴백
  let snapshotService: ISnapshotService = new FallbackSnapshotService();
  messageRouter.setSnapshotService(snapshotService);
  if (rootPath) {
    try {
      const snapshotDb = await GitCatDatabase.create(rootPath);
      const snapshotDbInstance = snapshotDb.getInstance();

      // [Task 45] AI 클라이언트 구성:
      // 기존 GitCat 익스텐션의 AI 설정값(모드, 로컬 모델 경로, API 키)을 그대로 가져와
      // 스냅샷 요약 기능에도 동일한 모델/설정이 적용되도록 합니다.
      const { AiClient } = await import('@gitcat/ai-pipeline/extension');
      const snapshotAiClient = new AiClient(
        createExtensionAiClientOptions(context, aiSecretService, liveLocalRuntimeManager)
      );

      snapshotService = new SnapshotService(
        new SqliteSnapshotRepository(snapshotDbInstance),
        new SqliteSnapshotFileRepository(snapshotDbInstance),
        new SqliteWorkSessionRepository(snapshotDbInstance),
        {
          workspaceRoot: rootPath,
          // [Task 45] AI 클라이언트를 주입하면 스냅샷 생성 직후 백그라운드에서 자동 요약이 실행됩니다.
          aiClient: snapshotAiClient,
          snapshotSummaryLanguageResolver: () => resolveLocale(),
          // 스냅샷 생성 직후 즉시 브로드캐스트하여 UI가 늦게 뜨는 현상을 방지합니다.
          onSnapshotCreated: (row) => {
            messageRouter.broadcast({
              type: 'SNAPSHOT_CREATED',
              payload: {
                snapshot: {
                  snapshotId: row.snapshot_id,
                  type: row.type as any,
                  createdAt: row.created_at,
                  summary: undefined, // 생성 직후에는 타입 fallback을 먼저 보여주고, 이후 비동기 요약으로 갱신
                },
              },
            });
          },
          // [Task 45] AI 요약이 완료되면 이 콜백이 호출됩니다.
          // messageRouter.broadcast를 통해 연결된 모든 웹뷰에 SNAPSHOT_UPDATED 이벤트를 전송하여
          // 스냅샷 목록의 이름이 실시간으로 갱신되도록 합니다.
          onSnapshotUpdated: (row) => {
            messageRouter.broadcast({
              type: 'SNAPSHOT_UPDATED',
              payload: {
                snapshot: {
                  snapshotId: row.snapshot_id,
                  type: row.type as any,
                  createdAt: row.created_at,
                  summary: row.summary ?? undefined,
                },
              },
            });
          },
        },
      );
      const restoreHistoryRepository = new SqliteRestoreHistoryRepository(snapshotDbInstance);
      messageRouter.setSnapshotService(snapshotService);
      messageRouter.setSnapshotQueryService(
        new SnapshotQueryService(
          new SqliteSnapshotRepository(snapshotDbInstance),
          new SqliteSnapshotFileRepository(snapshotDbInstance),
          rootPath,
        ),
      );
      messageRouter.setRestoreService(
        new RestoreService(
          new SqliteSnapshotRepository(snapshotDbInstance),
          restoreHistoryRepository,
          snapshotService,
          rootPath,
        ),
      );
      messageRouter.setRestoreHistoryQueryService(
        new RestoreHistoryQueryService(
          restoreHistoryRepository,
          rootPath,
        ),
      );
      console.log('GitCat Safety Layer (SnapshotService) initialized at:', rootPath);
    } catch (snapshotInitError) {
      console.error('GitCat Safety Layer 초기화 실패, FallbackSnapshotService로 폴백합니다:', snapshotInitError);
      vscode.window.showWarningMessage(t('safety.init.failed'));
    }
  }


  const sessionCoordinator = new SafetySessionCoordinator(snapshotService);
  messageRouter.setSafetySessionCoordinator(sessionCoordinator);
  CommandRegistry.registerAll(
    context,
    webviewProvider,
    gitService,
    sessionCoordinator,
    liveLocalRuntimeManager,
  );
  EventRegistry.registerAll(context, sessionCoordinator, gitStatusRefreshController);

  if (rootPath && projectId && gitService) {
    void initializeRecommendationBackfill(
      context,
      aiSecretService,
      liveLocalRuntimeManager,
      rootPath,
      projectId,
      gitService,
      messageRouter,
      dbInstance,
      (clearFn) => { clearAiCache = clearFn; },
    );
  }
}

async function initializeMergeConflictAnalysis(
  context: vscode.ExtensionContext,
  gitService: GitService,
  dbInstance: SQLiteDatabase,
  messageRouter: MessageRouter,
  workspaceRoot: string,
  aiSecretService: AiSecretService,
  liveLocalRuntimeManager: LiveLocalRuntimeManager,
  gitMessageHandler?: GitMessageHandler,
  pullRequestHandler?: PullRequestMessageHandler,
  prSettingsService?: PrSettingsService,
): Promise<void> {
  const repositories = createMergeRepositories(dbInstance);
  const assembler = new MergeInputAssembler(gitService);
  const artifactStore = new MergeAnalysisArtifactStore();
  const analysisService = new MergeConflictAnalysisService(
    assembler,
    repositories,
    artifactStore,
    gitService,
  );
  const proposalService = new MergeProposalService(
    repositories,
    artifactStore,
    workspaceRoot,
    gitService,
    await createMergeProposalProvider(context, aiSecretService, liveLocalRuntimeManager, workspaceRoot),
  );
  const guardService = new MergeConflictGuardService(
    gitService,
    analysisService,
    () => prSettingsService?.getDefaultBaseBranch() ?? null,
  );

  messageRouter.setMergeConflictHandler(new MergeConflictMessageHandler(analysisService, messageRouter));
  messageRouter.setMergeProposalHandler(new MergeProposalMessageHandler(proposalService, messageRouter));
  gitMessageHandler?.setMergeConflictGuardService(guardService);
  pullRequestHandler?.setMergeConflictGuardService(guardService);
  console.log('GitCat merge conflict analysis layer initialized');
}

async function createMergeProposalProvider(
  context: vscode.ExtensionContext,
  aiSecretService: AiSecretService,
  liveLocalRuntimeManager: LiveLocalRuntimeManager,
  workspaceRoot: string,
): Promise<MergeProposalProvider> {
  try {
    const { MergeAiService, AiClient } = await import('@gitcat/ai-pipeline/extension');
    const aiClient = new AiClient(
      createExtensionAiClientOptions(context, aiSecretService, liveLocalRuntimeManager)
    );

    return new AiPipelineMergeProposalProvider(
      new MergeAiService(aiClient),
      workspaceRoot,
    );
  } catch (error) {
    // AI 파이프라인 초기화 실패 시에도 병합 분석/수락 흐름은 확인할 수 있도록 로컬 MVP provider로 낮춥니다.
    console.warn('GitCat merge AI provider initialization failed. Falling back to local provider:', error);
    return new LocalMergeProposalDraftProvider();
  }
}

async function initializeRecommendationBackfill(
  context: vscode.ExtensionContext,
  aiSecretService: AiSecretService,
  liveLocalRuntimeManager: LiveLocalRuntimeManager,
  rootPath: string,
  projectId: string,
  gitService: GitService,
  messageRouter: MessageRouter,
  dbInstance?: SQLiteDatabase,
  setClearAiCache?: (fn: () => void) => void,
): Promise<void> {
  try {
    const recommendationModule = await import('./features/recommendation');
    const { MergeAiService, AiClient } = await import('@gitcat/ai-pipeline/extension');

    const aiClientOptions = createExtensionAiClientOptions(
      context,
      aiSecretService,
      liveLocalRuntimeManager,
    );
    const aiClient = new AiClient(aiClientOptions);
    const recommendationAiService = new MergeAiService(aiClient);
    if (setClearAiCache) {
      setClearAiCache(() => recommendationAiService.clearCache());
    }

    const branchRecommendationService = new recommendationModule.BranchRecommendationService(gitService, {
      projectId,
      aiService: recommendationAiService,
    });
    const commitRawDataService = new recommendationModule.CommitRecommendationRawDataService(gitService);
    const commitRecommendationService = new recommendationModule.CommitRecommendationService(commitRawDataService, {
      projectId,
      aiService: recommendationAiService,
    });

    messageRouter.configureRecommendationHandlers({
      branchRecommendationHandler: new recommendationModule.BranchRecommendationMessageHandler(branchRecommendationService),
      commitRecommendationHandler: new recommendationModule.CommitRecommendationMessageHandler(commitRecommendationService),
    });

    if (!dbInstance) {
      return;
    }

    const historyRepository = new SqliteRecommendationHistoryRepository(dbInstance);
    const { RecommendationHistoryQueryService } = await import('./features/recommendation/RecommendationHistoryQueryService');
    const { PrRecommendationService } = await import('./features/recommendation/PrRecommendationService');
    const { PrRecommendationHandler } = await import('./features/recommendation/PrRecommendationHandler');
    const historyQueryService = new RecommendationHistoryQueryService(historyRepository);

    const branchRecommendationServiceWithHistory = new recommendationModule.BranchRecommendationService(gitService, {
      historyRepository,
      projectId,
      aiService: recommendationAiService,
    });
    const commitRecommendationServiceWithHistory = new recommendationModule.CommitRecommendationService(commitRawDataService, {
      historyRepository,
      projectId,
      aiService: recommendationAiService,
    });
    const prRecommendationService = new PrRecommendationService(
      gitService,
      recommendationAiService,
      historyRepository,
      projectId,
      historyQueryService,
    );

    messageRouter.configureRecommendationHandlers({
      branchRecommendationHandler: new recommendationModule.BranchRecommendationMessageHandler(branchRecommendationServiceWithHistory),
      commitRecommendationHandler: new recommendationModule.CommitRecommendationMessageHandler(commitRecommendationServiceWithHistory),
      prRecommendationHandler: new PrRecommendationHandler(prRecommendationService),
    });

    console.log('GitCat recommendation history layer initialized');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to initialize GitCat recommendation layer:', error);
    void vscode.window.showWarningMessage(t('recommendation.init.failed', { message }));
    void messageRouter.broadcast({
      type: 'NOTIFICATION',
      payload: {
        type: 'warning',
        message: t('recommendation.init.banner'),
      },
    });
  }
}

export function deactivate() {
  console.log('GitCat Extension deactivated.');
}

let hasShownLegacyMockModeWarning = false;

function createExtensionAiClientOptions(
  context: vscode.ExtensionContext,
  aiSecretService: AiSecretService,
  liveLocalRuntimeManager: LiveLocalRuntimeManager,
) {
  const config = vscode.workspace.getConfiguration('gitcat.ai');
  const normalizedMode = normalizeExtensionAiMode(config.get<string>('mode'));
  if (normalizedMode.warningMessage && !hasShownLegacyMockModeWarning) {
    hasShownLegacyMockModeWarning = true;
    void vscode.window.showWarningMessage(normalizedMode.warningMessage);
  }

  const remoteBaseUrl = normalizeConfiguredValue(config.get<string>('remoteBaseUrl'));
  const remoteModel = normalizeConfiguredValue(config.get<string>('remoteModel'));

  return {
    mode: normalizedMode.mode,
    localModelPath: config.get<string>('localModelPath'),
    localRuntimeRoot: liveLocalRuntimeManager.getRuntimeRoot(),
    allowBundledLocalRuntimeFallback: context.extensionMode !== vscode.ExtensionMode.Production,
    apiKeyProvider: async () => aiSecretService.getApiKey(),
    baseURL: remoteBaseUrl ? resolveConfiguredRemoteBaseUrl(remoteBaseUrl) : undefined,
    model: remoteModel || undefined,
  };
}

function normalizeConfiguredValue(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveConfiguredRemoteBaseUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    const hasOpenAiCompatiblePath = parsed.href.includes('api.openai.com/')
      || normalizedPath.endsWith('/v1');

    if (hasOpenAiCompatiblePath) {
      return baseUrl.replace(/\/+$/, '');
    }
  } catch {
    return baseUrl;
  }

  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalized}api.openai.com/v1`;
}
