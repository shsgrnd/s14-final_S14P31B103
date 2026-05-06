import * as vscode from 'vscode';
import { createHash } from 'crypto';
import { GitCatDatabase, SqliteRecommendationHistoryRepository } from '@gitcat/storage';
import { GitCliClient } from '@gitcat/git-client-cli';
import { MergeAiService } from '@gitcat/ai-pipeline';
import { CommandRegistry } from './commands';
import { EventRegistry } from './events';
import { WebviewProvider } from './webview/WebviewProvider';
import { SidebarProvider } from './webview/SidebarProvider';
import { MessageRouter } from './core/MessageRouter';
import { GitService } from './features/git/GitService';
import { GitMessageHandler } from './features/git/GitMessageHandler';
import { GitMetadataSyncService } from './features/git/GitMetadataSyncService';
import { GitStatusRefreshController } from './features/git/GitStatusRefreshController';
import { BranchCleanupService } from './features/git/BranchCleanupService';
import {
  BranchRecommendationMessageHandler,
  BranchRecommendationService,
} from './features/recommendation';
import { RecommendationService } from './features/recommendation/RecommendationService';
import { RecommendationHandler } from './features/recommendation/RecommendationHandler';

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

  let dbInstance: any = null;
  if (rootPath && projectId) {
    const dbPath = GitCatDatabase.getDatabasePath(rootPath);
    try {
      const database = await GitCatDatabase.create(rootPath);
      dbInstance = database.getInstance();
      console.log('GitCat Database initialized successfully at:', dbPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to initialize GitCat Database:', error);
      vscode.window.showErrorMessage(`GitCat DB 초기화 실패: ${message}`);
    }
  }

  let gitMessageHandler: GitMessageHandler | undefined;
  let branchRecommendationHandler: BranchRecommendationMessageHandler | undefined;
  let gitService: GitService | undefined;
  if (rootPath && projectId) {
    try {
      const gitClient = new GitCliClient(rootPath);
      const gitMetadataSync = dbInstance
        ? new GitMetadataSyncService(dbInstance, rootPath)
        : undefined;
      gitService = new GitService(gitClient, gitMetadataSync);

      const branchCleanupService = new BranchCleanupService(gitService);
      gitMessageHandler = new GitMessageHandler(gitService, branchCleanupService);

      const branchHistoryRepository = dbInstance
        ? new SqliteRecommendationHistoryRepository(dbInstance)
        : undefined;
      const branchRecommendationService = new BranchRecommendationService(gitService, {
        historyRepository: branchHistoryRepository,
        projectId,
      });
      branchRecommendationHandler = new BranchRecommendationMessageHandler(branchRecommendationService);

      console.log('GitCat Git layer initialized at:', rootPath);
    } catch (error) {
      console.error('Failed to initialize GitCat Git layer:', error);
      vscode.window.showWarningMessage('GitCat Git 기능 초기화에 실패했습니다. Git 기능을 사용할 수 없습니다.');
    }
  }

  let recommendationHandler: RecommendationHandler | undefined;
  if (rootPath && gitService && dbInstance && projectId) {
    try {
      const historyRepository = new SqliteRecommendationHistoryRepository(dbInstance);
      const aiService = new MergeAiService();
      const recommendationService = new RecommendationService(
        gitService,
        aiService,
        historyRepository,
        projectId
      );
      recommendationHandler = new RecommendationHandler(recommendationService);
      console.log('GitCat Recommendation layer initialized');
    } catch (error) {
      console.error('Failed to initialize GitCat Recommendation layer:', error);
    }
  }

  const messageRouter = new MessageRouter(
    dbInstance,
    gitMessageHandler,
    branchRecommendationHandler,
    recommendationHandler,
  );

  if (gitService) {
    const gitStatusRefreshController = new GitStatusRefreshController(gitService, messageRouter);
    gitStatusRefreshController.start();
    context.subscriptions.push(gitStatusRefreshController);
  }

  const webviewProvider = new WebviewProvider(context, messageRouter);
  const sidebarProvider = new SidebarProvider(context, messageRouter);
  vscode.window.registerWebviewViewProvider('gitcat-sidebar-webview', sidebarProvider);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      vscode.window.showInformationMessage('GitCat: 작업 폴더가 변경되었습니다. 창을 다시 로드해주세요.');
    })
  );

  CommandRegistry.registerAll(context, webviewProvider, gitService);
  EventRegistry.registerAll(context);
}

export function deactivate() {
  console.log('GitCat Extension deactivated.');
}
