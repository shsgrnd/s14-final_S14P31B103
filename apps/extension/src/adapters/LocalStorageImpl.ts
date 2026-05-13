import { IStorageService } from '../core/interfaces/IStorageService';
import {
    SnapshotLocalArtifact,
    SnapshotLocalArtifactReadResult,
    SnapshotLocalStore,
    SnapshotStoreResult,
} from '../features/safety/snapshot/SnapshotLocalStore';
import type { SnapshotHunk, SnapshotManifest } from '@gitcat/shared-types';

export class LocalStorageImpl implements IStorageService {
    private readonly snapshotStore: SnapshotLocalStore;

    constructor(projectRoot: string) {
        this.snapshotStore = new SnapshotLocalStore(projectRoot);
    }

    async saveSnapshotArtifact(input: SnapshotLocalArtifact): Promise<SnapshotStoreResult> {
        return this.snapshotStore.saveSnapshotArtifact(input);
    }

    async readSnapshotArtifact(snapshotId: string): Promise<SnapshotLocalArtifactReadResult> {
        return this.snapshotStore.readSnapshotArtifact(snapshotId);
    }

    async readSnapshotManifest(snapshotId: string): Promise<SnapshotManifest> {
        return this.snapshotStore.readManifest(snapshotId);
    }

    async readSnapshotPatch(snapshotId: string): Promise<string> {
        return this.snapshotStore.readPatch(snapshotId);
    }

    async readSnapshotHunks(snapshotId: string): Promise<SnapshotHunk[]> {
        return this.snapshotStore.readHunks(snapshotId);
    }

    async deleteSnapshot(snapshotId: string): Promise<void> {
        return this.snapshotStore.deleteSnapshot(snapshotId);
    }

    async saveSnapshotFiles(snapshotId: string, files: any[]): Promise<void> {
        await this.snapshotStore.ensureAuxiliaryDirs(snapshotId);
        void files;
    }

    async saveMergeArtifacts(analysisId: string, analysisData: any, proposalData: any): Promise<void> {
        // .vscode/gitcat/merge-sessions/{analysisId}/ 하위에 json 파일 생성 로직
        void analysisId;
        void analysisData;
        void proposalData;
    }

    async cleanTempDirectory(): Promise<void> {
        // .vscode/gitcat/temp/ 하위 정리 로직
    }
}
