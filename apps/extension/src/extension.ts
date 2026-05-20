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

  // ?뺚뺚?GitHub PR ?앹꽦 怨꾩링 珥덇린???뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚?  // GitHub token? VS Code SecretStorage?먮쭔 ??ν븳?? (SQLite/?뚯씪 湲덉?)
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
    pullRequestHandler,  // GitHub PR ?앹꽦 ?듬뱾??二쇱엯
    undefined,
    aiApiKeyMessageHandler, // AI API Key ?몃뱾??二쇱엯
  );
  aiApiKeyMessageHandler.attachMessageRouter(messageRouter);

  // PR ?섍꼍?ㅼ젙 ?몃뱾??????webview媛 怨듭쑀??湲곕낯 target 釉뚮옖移??깆쓣 workspaceState????ν븳??
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

  // ?뺚뺚?Safety Layer (Snapshot Service) 珥덇린???뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚뺚?  // DB 珥덇린???깃났 ???ㅼ젣 SnapshotService, ?ㅽ뙣 ??FallbackSnapshotService濡??대갚
  let snapshotService: ISnapshotService = new FallbackSnapshotService();
  messageRouter.setSnapshotService(snapshotService);
  if (rootPath) {
    try {
      const snapshotDb = await GitCatDatabase.create(rootPath);
      const snapshotDbInstance = snapshotDb.getInstance();

      // [Task 45] AI ?대씪?댁뼵??援ъ꽦:
      // 湲곗〈 GitCat ?듭뒪?먯뀡??AI ?ㅼ젙媛?紐⑤뱶, 濡쒖뺄 紐⑤뜽 寃쎈줈, API ????洹몃?濡?媛?몄?
      // ?ㅻ깄???붿빟 湲곕뒫?먮룄 ?숈씪??紐⑤뜽/?ㅼ젙???곸슜?섎룄濡??⑸땲??
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
          // [Task 45] AI ?대씪?댁뼵?몃? 二쇱엯?섎㈃ ?ㅻ깄???앹꽦 吏곹썑 諛깃렇?쇱슫?쒖뿉???먮룞 ?붿빟???ㅽ뻾?⑸땲??
          aiClient: snapshotAiClient,
          snapshotSummaryLanguageResolver: () => resolveLocale(),
          // ?ㅻ깄???앹꽦 吏곹썑 利됱떆 釉뚮줈?쒖틦?ㅽ듃?섏뿬 UI媛 ??쾶 ?⑤뒗 ?꾩긽??諛⑹??⑸땲??
          onSnapshotCreated: (row, changedFiles) => {
            messageRouter.broadcast({
              type: 'SNAPSHOT_CREATED',
              payload: {
                snapshot: {
                  snapshotId: row.snapshot_id,
                  type: row.type as any,
                  createdAt: row.created_at,
                  changedFileCount: changedFiles.length,
                  files: changedFiles.map((file) => ({
                    path: file.filePath,
                    status: file.status,
                    added: file.additions,
                    removed: file.deletions,
                    additions: file.additions,
                    deletions: file.deletions,
                    hunkCount: file.hunkCount,
                    isBinary: file.isBinary,
                    isLargeFile: file.isLargeFile,
                    importance: file.importance,
                    renamedFrom: file.renamedFrom,
                    renamedTo: file.renamedTo,
                  })),
                  summary: undefined, // ?앹꽦 吏곹썑?먮뒗 ???fallback??癒쇱? 蹂댁뿬二쇨퀬, ?댄썑 鍮꾨룞湲??붿빟?쇰줈 媛깆떊
                },
              },
            });
          },
          // [Task 45] AI ?붿빟???꾨즺?섎㈃ ??肄쒕갚???몄텧?⑸땲??
          // messageRouter.broadcast瑜??듯빐 ?곌껐??紐⑤뱺 ?밸럭??SNAPSHOT_UPDATED ?대깽?몃? ?꾩넚?섏뿬
          // ?ㅻ깄??紐⑸줉???대쫫???ㅼ떆媛꾩쑝濡?媛깆떊?섎룄濡??⑸땲??
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
      console.error('GitCat Safety Layer 珥덇린???ㅽ뙣, FallbackSnapshotService濡??대갚?⑸땲??', snapshotInitError);
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
    // AI ?뚯씠?꾨씪??珥덇린???ㅽ뙣 ?쒖뿉??蹂묓빀 遺꾩꽍/?섎씫 ?먮쫫? ?뺤씤?????덈룄濡?濡쒖뺄 MVP provider濡???땅?덈떎.
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

