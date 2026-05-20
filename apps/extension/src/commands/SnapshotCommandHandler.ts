import * as vscode from 'vscode';
import { SafetySessionCoordinator } from '../features/safety/session/SafetySessionCoordinator';
import { t } from '../i18n';

export class SnapshotCommandHandler {
    static async handleCreateSnapshot(
        safetySessionCoordinator: SafetySessionCoordinator,
    ): Promise<string | undefined> {
        const title = await vscode.window.showInputBox({
            title: t('snapshot.create.title'),
            prompt: t('snapshot.create.prompt'),
            placeHolder: t('snapshot.create.placeholder'),
            ignoreFocusOut: true,
        });

        if (title === undefined) {
            vscode.window.showInformationMessage(t('snapshot.create.cancelled'));
            return undefined;
        }

        const snapshotId = await safetySessionCoordinator.createManualSnapshot(title);

        if (!snapshotId) {
            vscode.window.showWarningMessage(t('snapshot.create.skipped'));
            return undefined;
        }

        vscode.window.showInformationMessage(t('snapshot.create.success', { snapshotId }));
        return snapshotId;
    }

    static async handleListSnapshots(): Promise<never[]> {
        console.log('Snapshot list requested');
        return [];
    }
}
