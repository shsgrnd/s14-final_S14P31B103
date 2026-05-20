import * as vscode from 'vscode';
import { WorkspaceWatcher } from './WorkspaceWatcher';
import { SafetySessionCoordinator } from '../features/safety/session/SafetySessionCoordinator';
import type { GitStatusRefreshController } from '../features/git/GitStatusRefreshController';

export class EventRegistry {
    static registerAll(
        context: vscode.ExtensionContext,
        sessionCoordinator?: SafetySessionCoordinator,
        gitStatusRefresh?: GitStatusRefreshController,
    ) {
        WorkspaceWatcher.register(context, sessionCoordinator, gitStatusRefresh);
    }
}
