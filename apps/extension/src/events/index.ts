import * as vscode from 'vscode';
import { WorkspaceWatcher } from './WorkspaceWatcher';
import { SessionManager } from '../features/safety/session/SessionManager';

export class EventRegistry {
    static registerAll(context: vscode.ExtensionContext, sessionManager?: SessionManager) {
        // 파일 시스템 감시 등 이벤트 등록 뼈대
        WorkspaceWatcher.register(context, sessionManager);
    }
}
