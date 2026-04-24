import * as vscode from 'vscode';
import { WorkspaceWatcher } from './WorkspaceWatcher';

export class EventRegistry {
    static registerAll(context: vscode.ExtensionContext) {
        // 파일 시스템 감시 등 이벤트 등록 뼈대
        WorkspaceWatcher.register(context);
    }
}
