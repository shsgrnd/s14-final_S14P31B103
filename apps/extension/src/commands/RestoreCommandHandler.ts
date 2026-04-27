export class RestoreCommandHandler {
    static async handleRestoreSnapshot(snapshotId: string): Promise<boolean> {
        // 실제 구현 시 RestoreService 등을 호출
        console.log(`Restore requested for snapshot: ${snapshotId}`);
        return true;
    }
}
