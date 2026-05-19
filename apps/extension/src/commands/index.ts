import * as vscode from 'vscode';
import { PanelCommandHandler } from './PanelCommandHandler';
import { WebviewProvider } from '../webview/WebviewProvider';
import { GitService } from '../features/git/GitService';
import { GitHubTokenProvider } from '../integrations/github/GitHubTokenProvider';
import { SafetySessionCoordinator } from '../features/safety/session/SafetySessionCoordinator';
import { LiveLocalRuntimeManager } from '../platform/LiveLocalRuntimeManager';
import { t } from '../i18n';

export class CommandRegistry {
    static registerAll(
        context: vscode.ExtensionContext,
        webviewProvider: WebviewProvider,
        gitService?: GitService,
        safetySessionCoordinator?: SafetySessionCoordinator,
        liveLocalRuntimeManager?: LiveLocalRuntimeManager,
    ) {

        context.subscriptions.push(
            vscode.commands.registerCommand('gitcat.openPanel', () => {
                PanelCommandHandler.execute(context, webviewProvider);
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('gitcat.getGitStatus', async () => {
                return await gitService?.getStatusWithWorktrees({ fetchRemote: true });
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('gitcat.installLocalRuntime', async () => {
                await liveLocalRuntimeManager?.startInstallFlow();
            }),
            vscode.commands.registerCommand('gitcat.setGitHubToken', async () => {
                const token = await vscode.window.showInputBox({
                    title: t('githubToken.input.title'),
                    prompt: t('githubToken.input.prompt'),
                    password: true,
                    ignoreFocusOut: true,
                    validateInput: (value) => value.trim() ? undefined : t('githubToken.input.validation'),
                });

                if (!token) return;

                const tokenProvider = new GitHubTokenProvider(context.secrets);
                await tokenProvider.setToken(token.trim());
                vscode.window.showInformationMessage(t('githubToken.saved'));
            }),
            vscode.commands.registerCommand('gitcat.clearGitHubToken', async () => {
                const tokenProvider = new GitHubTokenProvider(context.secrets);
                await tokenProvider.deleteToken();
                vscode.window.showInformationMessage(t('githubToken.cleared'));
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('gitcat.createSnapshot', async () => {
                const { SnapshotCommandHandler } = await import('./SnapshotCommandHandler');
                if (!safetySessionCoordinator) {
                    throw new Error('SafetySessionCoordinator is not initialized.');
                }
                return await SnapshotCommandHandler.handleCreateSnapshot(safetySessionCoordinator);
            }),
            vscode.commands.registerCommand('gitcat.restoreSnapshot', async () => {
                const { RestoreCommandHandler } = await import('./RestoreCommandHandler');
                return await RestoreCommandHandler.handleRestoreSnapshot('dummy-id');
            })
        );
    }
}
