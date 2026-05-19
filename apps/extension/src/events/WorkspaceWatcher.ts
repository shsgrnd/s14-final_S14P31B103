import * as vscode from 'vscode';
import { SafetySessionCoordinator } from '../features/safety/session/SafetySessionCoordinator';
import type { GitStatusRefreshController } from '../features/git/GitStatusRefreshController';

export class WorkspaceWatcher {
    static register(
        context: vscode.ExtensionContext,
        sessionCoordinator?: SafetySessionCoordinator,
        gitStatusRefresh?: GitStatusRefreshController,
    ) {
        // 파일 저장 감지
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((doc) => {
                console.log(`Document saved: ${doc.uri.fsPath}`);
                if (sessionCoordinator) {
                    sessionCoordinator.handleDocumentSave(doc);
                }
                void gitStatusRefresh?.refresh({ force: true, fetchRemote: false });
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
