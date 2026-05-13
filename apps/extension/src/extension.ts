import * as vscode from 'vscode';
import { createHash } from 'crypto';
import { GitCatDatabase, SqliteRecommendationHistoryRepository } from '@gitcat/storage';
import { GitCliClient } from '@gitcat/git-client-cli';
import { CommandRegistry } from './commands';
import { EventRegistry } from './events';
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

  CommandRegistry.registerAll(context, webviewProvider, gitService);
  EventRegistry.registerAll(context);

  if (rootPath && projectId && gitService) {
    void initializeRecommendationBackfill(
      aiSecretService,
      rootPath,
      projectId,
      gitService,
      messageRouter,
      (clearFn) => { clearAiCache = clearFn; },
    );
  }
}

async function initializeRecommendationBackfill(
  aiSecretService: AiSecretService,
  rootPath: string,
  projectId: string,
  gitService: GitService,
  messageRouter: MessageRouter,
  setClearAiCache?: (fn: () => void) => void,
): Promise<void> {
  try {
    const recommendationModule = await import('./features/recommendation');
    const { MergeAiService, AiClient } = await import('@gitcat/ai-pipeline');
    
    const aiClient = new AiClient({
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

    const dbPath = GitCatDatabase.getDatabasePath(rootPath);
    const database = await GitCatDatabase.create(rootPath);
    const dbInstance = database.getInstance();
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

    console.log('GitCat Database initialized successfully at:', dbPath);
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
