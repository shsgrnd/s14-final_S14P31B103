import * as vscode from 'vscode';
import { WebviewProvider } from '../webview/WebviewProvider';

export class PanelCommandHandler {
    static execute(context: vscode.ExtensionContext, webviewProvider: WebviewProvider) {
        webviewProvider.createOrShow();
    }
}
