import { ISnapshotService, SnapshotCreationType, CreateSnapshotOptions } from './ISnapshotService';

/**
 * 임시 Mock 구현체입니다. 실제 스냅샷 기능이 완료되면 교체됩니다.
 */
export class MockSnapshotService implements ISnapshotService {
    public async createSnapshot(type: SnapshotCreationType, options?: CreateSnapshotOptions): Promise<string | undefined> {
        const snapshotId = `snap_${Date.now()}`;
        console.log(`[MockSnapshotService] 스냅샷 생성 요청됨: ${type}`);
        if (options?.reason) {
            console.log(` - Reason: ${options.reason}`);
        }
        if (options?.changedFiles) {
            console.log(` - Changed Files Count: ${options.changedFiles.length}`);
        }
        return snapshotId;
    }
}
