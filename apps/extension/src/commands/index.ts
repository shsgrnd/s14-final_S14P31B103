import * as vscode from 'vscode';
import { PanelCommandHandler } from './PanelCommandHandler';
import { GitCommandHandler } from './GitCommandHandler';
import { WebviewProvider } from '../webview/WebviewProvider';

export class CommandRegistry {
    static registerAll(context: vscode.ExtensionContext, webviewProvider: WebviewProvider) {

        // Webview 패널 오픈 커맨드 (I-10-gitcat.openPanel)
        context.subscriptions.push(
            vscode.commands.registerCommand('gitcat.openPanel', () => {
                PanelCommandHandler.execute(context, webviewProvider);
            })
        );

        // Git 관련 더미/API 호출 커맨드 (Tree View UI 등에서 호출)
        context.subscriptions.push(
            vscode.commands.registerCommand('gitcat.getGitStatus', async () => {
                return await GitCommandHandler.handleGetStatus();
            })
        );

        // 추가 커맨드 등록 위치
    }
}
