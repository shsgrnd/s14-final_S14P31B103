import * as vscode from 'vscode';
import { MessageRouter } from './MessageRouter';

export class WebviewProvider {
    private panel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) { }

    public createOrShow() {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this.panel) {
            this.panel.reveal(column);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'gitcat',
            'GitCat',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        this.panel.webview.html = this.getHtmlForWebview();

        // 프론트엔드로부터 오는 메시지 수신 (Message Router로 전달)
        this.panel.webview.onDidReceiveMessage(
            message => {
                MessageRouter.route(message, this.panel!.webview);
            },
            null,
            this.context.subscriptions
        );

        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
            },
            null,
            this.context.subscriptions
        );
    }

    private getHtmlForWebview(): string {
        // 실제 Svelte/React 빌드 파일 연동 예정
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>GitCat MVP</title>
</head>
<body>
    <h1>GitCat Webview Placeholder</h1>
    <button id="testBtn">Send Test Message</button>
    <script>
        const vscode = acquireVsCodeApi();
        document.getElementById('testBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'I-01-GET_SNAPSHOT_LIST' });
        });
    </script>
</body>
</html>`;
    }
}
