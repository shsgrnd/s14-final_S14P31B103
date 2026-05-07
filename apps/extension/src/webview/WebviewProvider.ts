import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MessageRouter } from '../core/MessageRouter';

export class WebviewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private panelMode: 'main' | 'pr' | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private readonly messageRouter: MessageRouter
    ) { }

    public createOrShow(viewMode: 'main' | 'pr' = 'main') {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this.panel) {
            if (this.panelMode !== viewMode) {
                this.panel.webview.html = this.getHtmlForWebview(this.panel.webview, viewMode);
                this.panelMode = viewMode;
            }
            this.panel.reveal(column);
            return;
        }

        const distPath = path.join(this.context.extensionPath, '..', 'webview-ui', 'dist');

        this.panel = vscode.window.createWebviewPanel(
            'gitcat',
            'GitCat',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(distPath)],
            }
        );

        this.panelMode = viewMode;
        this.panel.webview.html = this.getHtmlForWebview(this.panel.webview, viewMode);
        const webviewRegistration = this.messageRouter.registerWebview(this.panel.webview);

        this.panel.webview.onDidReceiveMessage(
            message => {
                this.messageRouter.route(message, this.panel!.webview);
            },
            null,
            this.context.subscriptions
        );

        this.panel.onDidDispose(
            () => {
                webviewRegistration.dispose();
                this.panel = undefined;
                this.panelMode = undefined;
            },
            null,
            this.context.subscriptions
        );
    }

    private getHtmlForWebview(webview: vscode.Webview, viewMode: 'sidebar' | 'main' | 'pr'): string {
        const distPath = vscode.Uri.file(
            path.join(this.context.extensionPath, '..', 'webview-ui', 'dist')
        );
        const indexPath = path.join(distPath.fsPath, 'index.html');

        if (!fs.existsSync(indexPath)) {
            return `<!DOCTYPE html>
<html lang="en">
<body>
    <div style="padding: 20px;">
        <h2>GitCat webview build is missing.</h2>
        <p>Run <code>corepack pnpm --filter @gitcat/webview-ui run build</code>.</p>
    </div>
</body>
</html>`;
        }

        let html = fs.readFileSync(indexPath, 'utf-8');
        html = html.replace(
            /<head>/,
            `<head><script>window.VIEW_MODE = "${viewMode}";</script>`
        );
        html = html.replace(/(href|src)="(?:\.\/)?assets\/([^"]+)"/g, (_match, attr, assetName) => {
            const assetUri = webview.asWebviewUri(
                vscode.Uri.file(path.join(distPath.fsPath, 'assets', assetName))
            );
            return `${attr}="${assetUri}"`;
        });

        return html;
    }
}
