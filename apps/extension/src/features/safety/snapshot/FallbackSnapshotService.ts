import { ISnapshotService, SnapshotCreationType, CreateSnapshotOptions } from './ISnapshotService';

/**
 * 실제 SnapshotService 초기화가 실패했을 때 사용하는 런타임 폴백 구현이다.
 * extension 전체를 중단시키지 않고 최소한의 동작과 로그만 유지한다.
 */
export class FallbackSnapshotService implements ISnapshotService {
    private restoreOperationActive = false;

    public async createSnapshot(type: SnapshotCreationType, options?: CreateSnapshotOptions): Promise<string | undefined> {
        if (this.restoreOperationActive && type !== 'pre_restore') {
            console.log(`[FallbackSnapshotService] restore lock active, snapshot skipped: ${type}`);
            return undefined;
        }

        const snapshotId = `snap_${Date.now()}`;
        console.log(`[FallbackSnapshotService] snapshot request: ${type}`);
        if (options?.reason) {
            console.log(` - Reason: ${options.reason}`);
        }
        if (options?.changedFiles) {
            console.log(` - Changed Files Count: ${options.changedFiles.length}`);
        }
        return snapshotId;
    }

    public beginRestoreOperation(): void {
        this.restoreOperationActive = true;
    }

    public endRestoreOperation(): void {
        this.restoreOperationActive = false;
    }

    public isRestoreOperationActive(): boolean {
        return this.restoreOperationActive;
    }

    public async deleteSnapshot(snapshotId: string): Promise<void> {
        console.log(`[FallbackSnapshotService] delete snapshot request: ${snapshotId}`);
    }
}
