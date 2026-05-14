import * as vscode from 'vscode';
import { createHash } from 'crypto';
import { GitCatDatabase, SqliteRecommendationHistoryRepository, SqliteSnapshotRepository, SqliteSnapshotFileRepository, SqliteWorkSessionRepository } from '@gitcat/storage';
import { GitCliClient } from '@gitcat/git-client-cli';
import { CommandRegistry } from './commands';
import { EventRegistry } from './events';
import { SafetySessionCoordinator } from './features/safety/session/SafetySessionCoordinator';
import { MockSnapshotService } from './features/safety/snapshot/MockSnapshotService';
import { SnapshotService } from './features/safety/snapshot/SnapshotService';
import { SnapshotQueryService } from './features/safety/snapshot/SnapshotQueryService';
import { ISnapshotService } from './features/safety/snapshot/ISnapshotService';
import { WebviewProvider } from './webview/WebviewProvider';
import { SidebarProvider } from './webview/SidebarProvider';
import { MessageRouter } from './core/MessageRouter';
import { AiSecretService } from './features/recommendation/AiSecretService';
import { AiApiKeyMessageHandler } from './features/recommendation/AiApiKeyMessageHandler';
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
import {
  createMergeRepositories,
  MergeAnalysisArtifactStore,
  MergeConflictAnalysisService,
  MergeConflictMessageHandler,
  MergeInputAssembler,
} from './features/merge-analysis';

export async function activate(context: vscode.ExtensionContext) {
  console.log('GitCat Extension is now active!');

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showInformationMessage('GitCat: 작업할 폴더를 먼저 열어주세요.');
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
      gitService = new GitService(gitClient);

      const branchCleanupService = new BranchCleanupService(gitService);
      gitMessageHandler = new GitMessageHandler(gitService, branchCleanupService);

      console.log('GitCat Git layer initialized at:', rootPath);
    } catch (error) {
      console.error('Failed to initialize GitCat Git layer:', error);
      vscode.window.showWarningMessage('GitCat Git 기능 초기화에 실패했습니다. Git 기능을 사용할 수 없습니다.');
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
      vscode.window.showWarningMessage('GitCat GitHub PR 기능 초기화에 실패했습니다.');
    }
  }



  const aiSecretService = new AiSecretService(context.secrets);
  let clearAiCache = () => {};
  const aiApiKeyMessageHandler = new AiApiKeyMessageHandler(aiSecretService, () => clearAiCache());

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
      vscode.window.showWarningMessage('GitCat 로컬 데이터베이스를 초기화하지 못했습니다.');
    }
  }

  if (rootPath && projectId && gitService && dbInstance) {
    initializeMergeConflictAnalysis(gitService, dbInstance, messageRouter);
  }

  if (gitService) {
    const gitStatusRefreshController = new GitStatusRefreshController(gitService, messageRouter);
    gitStatusRefreshController.start();
    context.subscriptions.push(gitStatusRefreshController);
  }

  const webviewProvider = new WebviewProvider(context, messageRouter);
  openPullRequestPanelRef.current = () => webviewProvider.createOrShow('pr');
  closePullRequestPanelRef.current = () => webviewProvider.closePrPanel();
  const sidebarProvider = new SidebarProvider(context, messageRouter);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('gitcat-sidebar-webview', sidebarProvider)
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      vscode.window.showInformationMessage('GitCat: 작업 폴더가 변경되었습니다. 창을 다시 로드해주세요.');
    })
  );

  // ――― Safety Layer (Snapshot Service) 초기화 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // DB 초기화 성공 시 실제 SnapshotService, 실패 시 MockSnapshotService로 폴백
  let snapshotService: ISnapshotService = new MockSnapshotService();
  if (rootPath) {
    try {
      const snapshotDb = await GitCatDatabase.create(rootPath);
      const snapshotDbInstance = snapshotDb.getInstance();
      snapshotService = new SnapshotService(
        new SqliteSnapshotRepository(snapshotDbInstance),
        new SqliteSnapshotFileRepository(snapshotDbInstance),
        new SqliteWorkSessionRepository(snapshotDbInstance),
        { workspaceRoot: rootPath },
      );
      messageRouter.setSnapshotQueryService(
        new SnapshotQueryService(
          new SqliteSnapshotRepository(snapshotDbInstance),
          new SqliteSnapshotFileRepository(snapshotDbInstance),
          rootPath,
        ),
      );
      console.log('GitCat Safety Layer (SnapshotService) initialized at:', rootPath);
    } catch (snapshotInitError) {
      console.error('GitCat Safety Layer 초기화 실패, MockSnapshotService로 폴백합니다:', snapshotInitError);
      vscode.window.showWarningMessage('GitCat Safety Layer 초기화에 실패했습니다. 스냅샷 기능이 제한됩니다.');
    }
  }

  const sessionCoordinator = new SafetySessionCoordinator(snapshotService);
  CommandRegistry.registerAll(context, webviewProvider, gitService);
  EventRegistry.registerAll(context, sessionCoordinator);

  if (rootPath && projectId && gitService) {
    void initializeRecommendationBackfill(
      aiSecretService,
      rootPath,
      projectId,
      gitService,
      messageRouter,
      dbInstance,
      (clearFn) => { clearAiCache = clearFn; },
    );
  }
}

function initializeMergeConflictAnalysis(
  gitService: GitService,
  dbInstance: SQLiteDatabase,
  messageRouter: MessageRouter,
): void {
  const repositories = createMergeRepositories(dbInstance);
  const assembler = new MergeInputAssembler(gitService);
  const artifactStore = new MergeAnalysisArtifactStore();
  const analysisService = new MergeConflictAnalysisService(
    assembler,
    repositories,
    artifactStore,
  );

  messageRouter.setMergeConflictHandler(new MergeConflictMessageHandler(analysisService));
  console.log('GitCat merge conflict analysis layer initialized');
}

async function initializeRecommendationBackfill(
  aiSecretService: AiSecretService,
  rootPath: string,
  projectId: string,
  gitService: GitService,
  messageRouter: MessageRouter,
  dbInstance?: SQLiteDatabase,
  setClearAiCache?: (fn: () => void) => void,
): Promise<void> {
  try {
    const recommendationModule = await import('./features/recommendation');
    const { MergeAiService, AiClient } = await import('@gitcat/ai-pipeline');
    
    const config = vscode.workspace.getConfiguration('gitcat.ai');
    const mode = config.get<string>('mode') as any;
    const localModelPath = config.get<string>('localModelPath');

    const aiClient = new AiClient({
      mode,
      localModelPath,
      apiKeyProvider: async () => aiSecretService.getApiKey(),
    });
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
    void vscode.window.showWarningMessage(`GitCat 추천 기능 초기화가 지연되거나 실패했습니다: ${message}`);
    void messageRouter.broadcast({
      type: 'NOTIFICATION',
      payload: {
        type: 'warning',
        message: 'GitCat 추천 기능이 아직 준비되지 않아 일부 AI 기능이 제한됩니다.',
      },
    });
  }
}

export function deactivate() {
  console.log('GitCat Extension deactivated.');
}
