import * as vscode from 'vscode';
import { SessionManager } from '../features/safety/session/SessionManager';

export class WorkspaceWatcher {
    static register(context: vscode.ExtensionContext, sessionManager?: SessionManager) {
        // 파일 저장 감지
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((doc) => {
                console.log(`Document saved: ${doc.uri.fsPath}`);
                if (sessionManager) {
                    sessionManager.handleDocumentSave(doc);
                }
                // GitStatus 갱신 이벤트 발생 -> Tree View 업데이트 알림
            })
        );

        // 파일 변경 감지
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (sessionManager) {
                    sessionManager.handleDocumentChange(event).catch(err => {
                        console.error('Error handling document change in SessionManager', err);
                    });
                }
            })
        );
    }
}
