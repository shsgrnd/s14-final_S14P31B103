import * as vscode from 'vscode';
import { SafetySessionCoordinator } from '../features/safety/session/SafetySessionCoordinator';

export class SnapshotCommandHandler {
    static async handleCreateSnapshot(
        safetySessionCoordinator: SafetySessionCoordinator,
    ): Promise<string | undefined> {
        const title = await vscode.window.showInputBox({
            title: 'GitCat: Create Snapshot',
            prompt: 'Optional snapshot title or reason',
            placeHolder: 'Manual snapshot before refactor',
            ignoreFocusOut: true,
        });

        if (title === undefined) {
            vscode.window.showInformationMessage('GitCat: Snapshot creation cancelled.');
            return undefined;
        }

        const snapshotId = await safetySessionCoordinator.createManualSnapshot(title);

        if (!snapshotId) {
            vscode.window.showWarningMessage(
                'GitCat: Snapshot was skipped. A restore may already be in progress.',
            );
            return undefined;
        }

        vscode.window.showInformationMessage(`GitCat: Snapshot created (${snapshotId}).`);
        return snapshotId;
    }

    static async handleListSnapshots(): Promise<never[]> {
        console.log('Snapshot list requested');
        return [];
    }
}
