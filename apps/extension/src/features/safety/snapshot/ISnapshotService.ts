export type SnapshotCreationType = 
    | 'ai_pre_action' 
    | 'auto_dirty_before_ai' 
    | 'ai_result' 
    | 'manual_checkpoint' 
    | 'manual_edit_result' 
    | 'pre_restore';

export interface CreateSnapshotOptions {
    sessionId?: string;
    reason?: string;
    summary?: string;
    changedFiles?: string[];
    baselines?: Map<string, string>;
}

export interface ISnapshotService {
    /**
     * 특정 타입의 스냅샷 생성을 요청합니다.
     * @param type 스냅샷 생성 트리거 유형 (예: 'auto_dirty_before_ai', 'ai_result' 등)
     * @param options 스냅샷 메타데이터로 기록될 추가 정보 (변경 파일, 베이스라인, 이유 등)
     * @returns 생성된 스냅샷 ID
     */
    createSnapshot(type: SnapshotCreationType, options?: CreateSnapshotOptions): Promise<string | undefined>;
}
