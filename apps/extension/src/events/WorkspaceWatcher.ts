import * as vscode from 'vscode';
import { SafetySessionCoordinator } from '../features/safety/session/SafetySessionCoordinator';

export class WorkspaceWatcher {
    static register(context: vscode.ExtensionContext, sessionCoordinator?: SafetySessionCoordinator) {
        // 파일 저장 감지
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((doc) => {
                console.log(`Document saved: ${doc.uri.fsPath}`);
                if (sessionCoordinator) {
                    sessionCoordinator.handleDocumentSave(doc);
                }
                // GitStatus 갱신 이벤트 발생 -> Tree View 업데이트 알림
            })
        );

        // 파일 변경 감지
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (sessionCoordinator) {
                    sessionCoordinator.handleDocumentChange(event).catch(err => {
                        console.error('Error handling document change in SafetySessionCoordinator', err);
                    });
                }
            })
        );
    }
}
