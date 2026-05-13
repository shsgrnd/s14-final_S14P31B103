import * as vscode from 'vscode';
import { WorkspaceWatcher } from './WorkspaceWatcher';
import { SafetySessionCoordinator } from '../features/safety/session/SafetySessionCoordinator';

export class EventRegistry {
    static registerAll(context: vscode.ExtensionContext, sessionCoordinator?: SafetySessionCoordinator) {
        // 파일 시스템 감시 등 이벤트 등록 뼈대
        WorkspaceWatcher.register(context, sessionCoordinator);
    }
}
