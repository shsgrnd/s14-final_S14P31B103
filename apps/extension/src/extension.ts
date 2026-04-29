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

export function activate(context: vscode.ExtensionContext) {
  console.log('GitCat Extension is now active!');

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showInformationMessage('GitCat: 워크스페이스(폴더)를 열어야 모든 기능을 사용할 수 있습니다.');
  }

  const rootPath = workspaceFolders?.[0]?.uri.fsPath ?? '';

  // ─── DB 초기화 ────────────────────────────────────────────────────────────
  let dbInstance: any = null;
  if (rootPath) {
    try {
      const database = new GitCatDatabase(rootPath);
      dbInstance = database.getInstance();
      console.log('GitCat Database initialized successfully at:', rootPath);

      // 도메인별 Repository 구현체 생성 및 dbInstance 주입 (Construc
      // tor Injection)
      // const sessionRepo = new WorkSessionRepositoryImpl(dbInstance);
      // const snapshotRepo = new SnapshotRepositoryImpl(dbInstance);

      // 비즈니스 Service 계층 생성 및 Repository 주입
      // const sessionService = new SessionService(sessionRepo, snapshotRepo);

    } catch (error) {
      console.error('Failed to initialize GitCat Database:', error);
      vscode.window.showErrorMessage('GitCat 로컬 데이터베이스 초기화에 실패했습니다.');
    }
  }

  // ─── Git 레이어 초기화 ────────────────────────────────────────────────────
  let gitMessageHandler: GitMessageHandler | undefined;
  if (rootPath) {
    try {
      const gitClient = new GitCliClient(rootPath);
      const gitService = new GitService(gitClient);
      gitMessageHandler = new GitMessageHandler(gitService);
      console.log('GitCat Git layer initialized at:', rootPath);
    } catch (error) {
      console.error('Failed to initialize GitCat Git layer:', error);
      vscode.window.showWarningMessage('GitCat Git 레이어 초기화에 실패했습니다. Git 기능이 제한됩니다.');
    }
  }

  // ─── 메시지 라우터 ────────────────────────────────────────────────────────
  const messageRouter = new MessageRouter(dbInstance, gitMessageHandler);

  // ─── Webview Provider 등록 ────────────────────────────────────────────────
  const webviewProvider = new WebviewProvider(context, messageRouter);
  const sidebarProvider = new SidebarProvider(context, messageRouter);
  vscode.window.registerWebviewViewProvider('gitcat-sidebar-webview', sidebarProvider);

  // ─── 워크스페이스 변경 시 Git 레이어 재초기화 (I-09-onDidChangeWorkspaceFolders) ───
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      vscode.window.showInformationMessage('GitCat: 워크스페이스가 변경되었습니다. 재시작 후 적용됩니다.');
    })
  );

  // ─── 커맨드 / 이벤트 등록 ────────────────────────────────────────────────
  CommandRegistry.registerAll(context, webviewProvider);
  EventRegistry.registerAll(context);
}

export function deactivate() {
  console.log('GitCat Extension deactivated.');
}
