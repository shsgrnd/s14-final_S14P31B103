import { SnapshotMeta } from '../types';

export interface IRepository {
    /**
     * SQLite에 메타데이터 저장 (스냅샷 예시)
     */
    saveSnapshotMeta(meta: SnapshotMeta): Promise<void>;

    getSnapshotMeta(snapshotId: string): Promise<SnapshotMeta | null>;

    // Session, MergeAnalysis 등 도메인별 저장 인터페이스 확장
}
