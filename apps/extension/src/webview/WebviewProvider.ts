import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MessageRouter } from '../core/MessageRouter';

export class WebviewProvider {
    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private readonly messageRouter: MessageRouter
    ) { }

    public createOrShow() {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this.panel) {
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

        this.panel.webview.html = this.getHtmlForWebview(this.panel.webview, 'main');

        this.panel.webview.onDidReceiveMessage(
            message => {
                this.messageRouter.route(message, this.panel!.webview);
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

    private getHtmlForWebview(webview: vscode.Webview, viewMode: 'sidebar' | 'main'): string {
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
