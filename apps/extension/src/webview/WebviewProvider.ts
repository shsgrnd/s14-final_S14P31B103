import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MessageRouter } from '../core/MessageRouter';
import { resolveWebviewDistPath } from './webviewAssets';

export class WebviewProvider {
    /** 병합 검토 / AI 탭 전용 메인 패널 */
    private mainPanel: vscode.WebviewPanel | undefined;
    /** PR 생성 전용 패널 */
    private prPanel: vscode.WebviewPanel | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private readonly messageRouter: MessageRouter
    ) { }

    public createOrShow(viewMode: 'main' | 'pr' = 'main') {
        if (viewMode === 'pr') {
            this.openPrPanel();
        } else {
            this.openMainPanel();
        }
    }

    /** 병합 검토 메인 패널이 열려 있는지 여부 (CONFLICT_RESULT 판단용) */
    public isMainPanelOpen(): boolean {
        return this.mainPanel !== undefined;
    }

    /** PR 패널이 열려 있는지 여부 */
    public isPrPanelOpen(): boolean {
        return this.prPanel !== undefined;
    }

    private openMainPanel(): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this.mainPanel) {
            this.mainPanel.reveal(column);
            return;
        }

        const distPath = resolveWebviewDistPath(this.context.extensionPath);

        this.mainPanel = vscode.window.createWebviewPanel(
            'gitcat-main',
            'GitCat',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(distPath)],
            }
        );

        this.mainPanel.webview.html = this.getHtmlForWebview(this.mainPanel.webview, 'main');
        const reg = this.messageRouter.registerWebview(this.mainPanel.webview);

        this.mainPanel.webview.onDidReceiveMessage(
            message => this.messageRouter.route(message, this.mainPanel!.webview),
            null,
            this.context.subscriptions
        );

        this.mainPanel.onDidDispose(
            () => {
                reg.dispose();
                this.mainPanel = undefined;
            },
            null,
            this.context.subscriptions
        );
    }

    private openPrPanel(): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this.prPanel) {
            this.prPanel.reveal(column);
            return;
        }

        const distPath = resolveWebviewDistPath(this.context.extensionPath);

        this.prPanel = vscode.window.createWebviewPanel(
            'gitcat-pr',
            'GitCat: PR',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(distPath)],
            }
        );

        this.prPanel.webview.html = this.getHtmlForWebview(this.prPanel.webview, 'pr');
        const reg = this.messageRouter.registerWebview(this.prPanel.webview);

        this.prPanel.webview.onDidReceiveMessage(
            message => this.messageRouter.route(message, this.prPanel!.webview),
            null,
            this.context.subscriptions
        );

        this.prPanel.onDidDispose(
            () => {
                reg.dispose();
                this.prPanel = undefined;
            },
            null,
            this.context.subscriptions
        );
    }

    public closePrPanel(): void {
        this.prPanel?.dispose();
    }

    private getHtmlForWebview(webview: vscode.Webview, viewMode: 'sidebar' | 'main' | 'pr'): string {
        const distPath = vscode.Uri.file(resolveWebviewDistPath(this.context.extensionPath));
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
