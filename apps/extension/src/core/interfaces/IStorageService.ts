import type { SnapshotHunk, SnapshotManifest } from '@gitcat/shared-types';
import type { SnapshotLocalArtifactReadResult, SnapshotStoreResult } from '../../features/safety/snapshot/SnapshotLocalStore';

export interface IStorageService {
    /**
     * .vscode/gitcat/snapshots/{snapshotId} 하위에 manifest.json, patch.diff, hunks.json 저장
     */
    saveSnapshotArtifact(input: {
        manifest: SnapshotManifest;
        patchText: string;
        hunks: SnapshotHunk[];
        includeFullFileBackupDir?: boolean;
        includeCodeBlobStoreDir?: boolean;
    }): Promise<SnapshotStoreResult>;

    readSnapshotArtifact(snapshotId: string): Promise<SnapshotLocalArtifactReadResult>;
    readSnapshotManifest(snapshotId: string): Promise<SnapshotManifest>;
    readSnapshotPatch(snapshotId: string): Promise<string>;
    readSnapshotHunks(snapshotId: string): Promise<SnapshotHunk[]>;
    deleteSnapshot(snapshotId: string): Promise<void>;

    /**
     * 로컬 파일 시스템에 스냅샷 원본 파일 복사 저장
     */
    saveSnapshotFiles(snapshotId: string, files: any[]): Promise<void>;
    
    /**
     * 병합 분석 산출물 (analysis.json, proposals.json) 저장
     */
    saveMergeArtifacts(analysisId: string, analysisData: any, proposalData: any): Promise<void>;

    /**
     * 임시 작업 폴더 정리
     */
    cleanTempDirectory(): Promise<void>;
}
