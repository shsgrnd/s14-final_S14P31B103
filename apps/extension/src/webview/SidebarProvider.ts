import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MessageRouter } from '../core/MessageRouter';

export class SidebarProvider implements vscode.WebviewViewProvider {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly messageRouter: MessageRouter
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        // 웹뷰 옵션 설정
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, '..', 'webview-ui', 'dist')),
                vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
            ]
        };

        // HTML 렌더링
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        // 프론트엔드 메시지 라우터 연결
        webviewView.webview.onDidReceiveMessage(
            message => {
                this.messageRouter.route(message, webviewView.webview);
            },
            undefined,
            this.context.subscriptions
        );
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const distPath = vscode.Uri.file(
            path.join(this.context.extensionPath, '..', 'webview-ui', 'dist')
        );
        const logoPath = vscode.Uri.file(
            path.join(this.context.extensionPath, 'media', 'GitCat_icon.png')
        );
        const indexPath = path.join(distPath.fsPath, 'index.html');

        if (!fs.existsSync(indexPath)) {
            return `<!DOCTYPE html>
<html lang="en">
<body>
    <div style="padding: 20px;">
        <h2>빌드된 프론트엔드 파일이 없습니다!</h2>
        <p>터미널에서 아래 명령어로 빌드해 주세요:</p>
        <code style="background: #333; padding: 4px; border-radius: 4px;">pnpm --filter @gitcat/webview-ui run build</code>
    </div>
</body>
</html>`;
        }

        let html = fs.readFileSync(indexPath, 'utf-8');
        const logoUri = webview.asWebviewUri(logoPath);

        // Vite 에셋 경로(./assets/... 또는 /assets/...)를 VS Code Webview URI로 변환
        html = html.replace(/(href|src)="(?:\.\/)?assets\/([^"]+)"/g, (match, attr, assetName) => {
            const assetUri = webview.asWebviewUri(
                vscode.Uri.file(path.join(distPath.fsPath, 'assets', assetName))
            );
            return `${attr}="${assetUri}"`;
        });

        html = html.replace(
            '</head>',
            `<script>window.GITCAT_LOGO_URI = "${logoUri.toString()}";</script></head>`
        );

        return html;
    }
}
