export type SnapshotCreationType =
    | 'ai_pre_action'
    | 'auto_dirty_before_ai'
    | 'ai_result'
    | 'manual_edit_result'
    | 'savepoint'       // 사용자가 수동으로 저장하는 세이브포인트
    | 'pre_restore';

export interface CreateSnapshotOptions {
    sessionId?: string;
    reason?: string;
    summary?: string;
    force?: boolean;
    /** AI 세션 중 변경된 파일 경로 목록 */
    changedFiles?: string[];
    /** AI 세션 시작 시점의 파일 베이스라인 (AI diff 계산용) */
    baselines?: Map<string, Uint8Array>;
    /**
     * 스냅샷 생성 시점의 현재 파일 상태.
     * - 미저장 편집 내용까지 diff에 반영하기 위해 사용
     */
    currentContents?: Map<string, Uint8Array | null>;
    /**
     * AI 세션 시작 전 사용자가 변경한 파일 경로 목록
     * - auto_dirty_before_ai, ai_result 타입에서 user_patch.diff 생성에 사용
     */
    userChangedFiles?: string[];
    /**
     * 사용자 변경 직전 파일 상태 (user_patch.diff 계산용)
     * - 이전 AI 세션 종료 시점부터 누적된 baseline
     */
    userBaselines?: Map<string, Uint8Array>;
    userCurrentContents?: Map<string, Uint8Array | null>;
}

export interface ISnapshotService {
    /**
     * 특정 타입의 스냅샷 생성을 요청합니다.
     * @param type 스냅샷 생성 트리거 유형 (예: 'auto_dirty_before_ai', 'ai_result' 등)
     * @param options 스냅샷 메타데이터로 기록될 추가 정보 (변경 파일, 베이스라인, 이유 등)
     * @returns 생성된 스냅샷 ID
     */
    createSnapshot(type: SnapshotCreationType, options?: CreateSnapshotOptions): Promise<string | undefined>;
    beginRestoreOperation(): void;
    endRestoreOperation(): void;
    isRestoreOperationActive(): boolean;
    /**
     * 특정 스냅샷의 로컬 artifact와 DB metadata를 함께 삭제한다.
     * 삭제 실패 시 가능한 범위에서 롤백하여 불일치를 최소화한다.
     */
    deleteSnapshot(snapshotId: string): Promise<void>;
}
