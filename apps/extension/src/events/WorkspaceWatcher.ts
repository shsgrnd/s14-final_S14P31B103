import * as vscode from 'vscode';
import { SafetySessionCoordinator } from '../features/safety/session/SafetySessionCoordinator';
import type { GitStatusRefreshController } from '../features/git/GitStatusRefreshController';

export class WorkspaceWatcher {
    static register(
        context: vscode.ExtensionContext,
        sessionCoordinator?: SafetySessionCoordinator,
        gitStatusRefresh?: GitStatusRefreshController,
    ) {
        if (sessionCoordinator) {
            for (const doc of vscode.workspace.textDocuments) {
                sessionCoordinator.rememberDocumentState(doc);
            }
            void sessionCoordinator.warmWorkspaceFileState();
        }

        context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument((doc) => {
                sessionCoordinator?.rememberDocumentState(doc);
            })
        );

        context.subscriptions.push(
            vscode.workspace.onWillSaveTextDocument((event) => {
                if (sessionCoordinator) {
                    event.waitUntil(
                        sessionCoordinator.handleWillSaveDocument(event.document).catch((err) => {
                            console.error('Error handling document will-save in SafetySessionCoordinator', err);
                        })
                    );
                }
            })
        );

        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((doc) => {
                console.log(`Document saved: ${doc.uri.fsPath}`);
                if (sessionCoordinator) {
                    sessionCoordinator.handleDocumentSave(doc).catch((err) => {
                        console.error('Error handling document save in SafetySessionCoordinator', err);
                    });
                }
                const saveFolder = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath;
                void gitStatusRefresh?.refresh({
                    force: true,
                    fetchRemote: false,
                    cwd: saveFolder,
                });
            })
        );

        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (sessionCoordinator) {
                    sessionCoordinator.handleDocumentChange(event).catch((err) => {
                        console.error('Error handling document change in SafetySessionCoordinator', err);
                    });
                }
            })
        );

        const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
        context.subscriptions.push(fileWatcher);

        context.subscriptions.push(
            fileWatcher.onDidChange((uri) => {
                sessionCoordinator?.handleFilesystemChange(uri).catch((err) => {
                    console.error('Error handling filesystem change in SafetySessionCoordinator', err);
                });
            })
        );

        context.subscriptions.push(
            fileWatcher.onDidCreate((uri) => {
                sessionCoordinator?.handleFilesystemCreate(uri).catch((err) => {
                    console.error('Error handling filesystem create in SafetySessionCoordinator', err);
                });
            })
        );

        context.subscriptions.push(
            fileWatcher.onDidDelete((uri) => {
                sessionCoordinator?.handleFilesystemDelete(uri).catch((err) => {
                    console.error('Error handling filesystem delete in SafetySessionCoordinator', err);
                });
            })
        );
    }
}
