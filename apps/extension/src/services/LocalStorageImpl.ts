import { IStorageService } from '../core/interfaces/IStorageService';

export class LocalStorageImpl implements IStorageService {
    async saveSnapshotFiles(snapshotId: string, files: any[]): Promise<void> {
        // .vscode/gitcat/snapshots/{snapshotId} 생성 및 원본 파일 복사 로직
    }

    async saveMergeArtifacts(analysisId: string, analysisData: any, proposalData: any): Promise<void> {
        // .vscode/gitcat/merge-sessions/{analysisId}/ 하위에 json 파일 생성 로직
    }

    async cleanTempDirectory(): Promise<void> {
        // .vscode/gitcat/temp/ 하위 정리 로직
    }
}
