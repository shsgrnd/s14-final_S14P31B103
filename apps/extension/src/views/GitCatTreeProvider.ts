import * as vscode from 'vscode';

export class GitCatTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!element) {
            // Root items
            return Promise.resolve([
                this.createItem("Staged Changes", vscode.TreeItemCollapsibleState.Expanded),
                this.createItem("Unstaged Changes", vscode.TreeItemCollapsibleState.Expanded),
                this.createItem("AI 추천 커밋", vscode.TreeItemCollapsibleState.None)
            ]);
        }
        
        return Promise.resolve([]);
    }

    private createItem(label: string, collapsibleState: vscode.TreeItemCollapsibleState): vscode.TreeItem {
        const item = new vscode.TreeItem(label, collapsibleState);
        return item;
    }
}
