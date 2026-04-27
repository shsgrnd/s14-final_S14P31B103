import { Snapshot } from '../core/types';

export class SnapshotCommandHandler {
    static async handleCreateSnapshot(): Promise<Snapshot | null> {
        // 실제 구현 시 SnapshotService 등을 호출
        console.log('Snapshot creation requested');
        return null;
    }

    static async handleListSnapshots(): Promise<Snapshot[]> {
        // 실제 구현 시 저장소에서 스냅샷 목록을 조회
        console.log('Snapshot list requested');
        return [];
    }
}
