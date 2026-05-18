import * as vscode from 'vscode';
import { PanelCommandHandler } from './PanelCommandHandler';
import { WebviewProvider } from '../webview/WebviewProvider';
import { GitService } from '../features/git/GitService';
import { GitHubTokenProvider } from '../integrations/github/GitHubTokenProvider';
import { SafetySessionCoordinator } from '../features/safety/session/SafetySessionCoordinator';
import { LiveLocalRuntimeManager } from '../platform/LiveLocalRuntimeManager';

export class CommandRegistry {
    static registerAll(
        context: vscode.ExtensionContext,
        webviewProvider: WebviewProvider,
        gitService?: GitService,
        safetySessionCoordinator?: SafetySessionCoordinator,
        liveLocalRuntimeManager?: LiveLocalRuntimeManager,
    ) {

        // Webview 패널 오픈 커맨드 (I-10-gitcat.openPanel)
        context.subscriptions.push(
            vscode.commands.registerCommand('gitcat.openPanel', () => {
                PanelCommandHandler.execute(context, webviewProvider);
            })
        );

        // Git 관련 더미/API 호출 커맨드 (Tree View UI 등에서 호출)
        context.subscriptions.push(
            vscode.commands.registerCommand('gitcat.getGitStatus', async () => {
                return await gitService?.getStatusWithWorktrees({ fetchRemote: true });
            })
        );

        // GitHub PR 생성 테스트용 토큰 설정
        context.subscriptions.push(
            vscode.commands.registerCommand('gitcat.installLocalRuntime', async () => {
                await liveLocalRuntimeManager?.startInstallFlow();
            }),
            vscode.commands.registerCommand('gitcat.setGitHubToken', async () => {
                const token = await vscode.window.showInputBox({
                    title: 'GitCat: Set GitHub Token',
                    prompt: 'GitHub Personal Access Token을 입력하세요. SecretStorage에만 저장됩니다.',
                    password: true,
                    ignoreFocusOut: true,
                    validateInput: (value) => value.trim() ? undefined : 'GitHub token을 입력하세요.',
                });

                if (!token) return;

                const tokenProvider = new GitHubTokenProvider(context.secrets);
                await tokenProvider.setToken(token.trim());
                vscode.window.showInformationMessage('GitCat: GitHub token이 저장되었습니다.');
            }),
            vscode.commands.registerCommand('gitcat.clearGitHubToken', async () => {
                const tokenProvider = new GitHubTokenProvider(context.secrets);
                await tokenProvider.deleteToken();
                vscode.window.showInformationMessage('GitCat: GitHub token이 삭제되었습니다.');
            }),
        );

        // 스냅샷 관련 커맨드
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

        // 추가 커맨드 등록 위치
    }
}
