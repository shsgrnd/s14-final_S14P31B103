import * as vscode from 'vscode';

export class WorkspaceWatcher {
    static register(context: vscode.ExtensionContext) {
        // 파일 저장 감지
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((doc) => {
                console.log(`Document saved: ${doc.uri.fsPath}`);
                // GitStatus 갱신 이벤트 발생 -> Tree View 업데이트 알림
            })
        );
    }
}
