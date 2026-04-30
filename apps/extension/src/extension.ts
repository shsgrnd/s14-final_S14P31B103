import * as vscode from 'vscode';
import { GitCatDatabase } from '@gitcat/storage';
import { GitCliClient } from '@gitcat/git-client-cli';
import { CommandRegistry } from './commands';
import { EventRegistry } from './events';
import { WebviewProvider } from './webview/WebviewProvider';
import { SidebarProvider } from './webview/SidebarProvider';
import { MessageRouter } from './core/MessageRouter';
import { GitService } from './features/git/GitService';
import { GitMessageHandler } from './features/git/GitMessageHandler';
import { GitMetadataSyncService } from './features/git/GitMetadataSyncService';

export async function activate(context: vscode.ExtensionContext) {
  console.log('GitCat Extension is now active!');

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showInformationMessage('GitCat: 작업할 폴더를 먼저 열어주세요.');
  }

  const rootPath = workspaceFolders?.[0]?.uri.fsPath ?? '';

  let dbInstance: any = null;
  if (rootPath) {
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
  if (rootPath) {
    try {
      const gitClient = new GitCliClient(rootPath);
      const gitMetadataSync = dbInstance
        ? new GitMetadataSyncService(dbInstance, rootPath)
        : undefined;
      const gitService = new GitService(gitClient, gitMetadataSync);
      gitMessageHandler = new GitMessageHandler(gitService);
      console.log('GitCat Git layer initialized at:', rootPath);
    } catch (error) {
      console.error('Failed to initialize GitCat Git layer:', error);
      vscode.window.showWarningMessage('GitCat Git 기능 초기화에 실패했습니다. Git 기능을 사용할 수 없습니다.');
    }
  }

  const messageRouter = new MessageRouter(dbInstance, gitMessageHandler);

  const webviewProvider = new WebviewProvider(context, messageRouter);
  const sidebarProvider = new SidebarProvider(context, messageRouter);
  vscode.window.registerWebviewViewProvider('gitcat-sidebar-webview', sidebarProvider);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      vscode.window.showInformationMessage('GitCat: 작업 폴더가 변경되었습니다. 창을 다시 로드해주세요.');
    })
  );

  CommandRegistry.registerAll(context, webviewProvider);
  EventRegistry.registerAll(context);
}

export function deactivate() {
  console.log('GitCat Extension deactivated.');
}
