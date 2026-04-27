export interface IStorageService {
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
