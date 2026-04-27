import * as vscode from 'vscode';
import { CommandRegistry } from './commands';
import { EventRegistry } from './events';
import { WebviewProvider } from './webview/WebviewProvider';
import { SidebarProvider } from './webview/SidebarProvider';
// import { GitCatTreeProvider } from './views/GitCatTreeProvider';
// import { SafetyTreeProvider } from './views/SafetyTreeProvider';
// import { BranchTreeProvider } from './views/BranchTreeProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('GitCat Extension is now active!');

  // Webview Provider 등록 (상세 팝업용)
  const webviewProvider = new WebviewProvider(context);

  // 사이드바 메인 UI (WebviewViewProvider 등록 - 프론트엔드 React 연동)
  const sidebarProvider = new SidebarProvider(context);
  vscode.window.registerWebviewViewProvider('gitcat-sidebar-webview', sidebarProvider);

  /* 백엔드 네이티브 트리뷰 (Webview 전환으로 인해 주석 처리)
  const gitCatProvider = new GitCatTreeProvider();
  vscode.window.registerTreeDataProvider('gitcat-git-view', gitCatProvider);

  const safetyProvider = new SafetyTreeProvider();
  vscode.window.registerTreeDataProvider('gitcat-safety-view', safetyProvider);

  const branchProvider = new BranchTreeProvider();
  vscode.window.registerTreeDataProvider('gitcat-branch-view', branchProvider);
  */

  // 명령어(Commands) 일괄 등록
  CommandRegistry.registerAll(context, webviewProvider);

  // 이벤트(Events/Watchers) 일괄 등록
  EventRegistry.registerAll(context);
}

export function deactivate() {
  console.log('GitCat Extension deactivated.');
}
