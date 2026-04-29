import * as vscode from 'vscode';
import { GitCatDatabase } from '@gitcat/storage';
import { CommandRegistry } from './commands';
import { EventRegistry } from './events';
import { WebviewProvider } from './webview/WebviewProvider';
import { SidebarProvider } from './webview/SidebarProvider';
import { MessageRouter } from './core/MessageRouter';

export function activate(context: vscode.ExtensionContext) {
  console.log('GitCat Extension is now active!');

  // 워크스페이스 확인 및 DB 초기화
  const workspaceFolders = vscode.workspace.workspaceFolders;
  let dbInstance: any = null;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showInformationMessage('GitCat: 워크스페이스(폴더)를 열어야 모든 기능을 사용할 수 있습니다.');
  } else {
    try {
      const rootPath = workspaceFolders[0].uri.fsPath;
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

  // 중앙 메시지 라우터 초기화
  const messageRouter = new MessageRouter(dbInstance);

  // Webview Provider 등록 (상세 팝업용)
  const webviewProvider = new WebviewProvider(context, messageRouter);

  // 사이드바 메인 UI (WebviewViewProvider 등록 - 프론트엔드 React 연동)
  const sidebarProvider = new SidebarProvider(context, messageRouter);
  vscode.window.registerWebviewViewProvider('gitcat-sidebar-webview', sidebarProvider);

  // 명령어(Commands) 일괄 등록
  CommandRegistry.registerAll(context, webviewProvider);

  // 이벤트(Events/Watchers) 일괄 등록
  EventRegistry.registerAll(context);
}

export function deactivate() {
  console.log('GitCat Extension deactivated.');
}
