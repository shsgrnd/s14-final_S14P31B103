/**
 * GitCatMessage.ts
 * WebView와 Extension Host 간의 통신을 정의하는 핵심 타입 정의입니다.
 */

export type MessageCommand = 
  | 'GET_SNAPSHOTS'         // 스냅샷 목록 요청
  | 'SNAPSHOTS_UPDATED'     // 스냅샷 목록 업데이트 전송 (백엔드 -> 프론트)
  | 'RESTORE_SNAPSHOT'      // 특정 스냅샷으로 원복 실행 요청
  | 'ANALYZE_CONFLICTS'      // 현재 충돌 가능성 분석 요청
  | 'CONFLICTS_ANALYZED'    // 충돌 분석 결과 전송 (백엔드 -> 프론트)
  | 'GET_AI_DRAFT'          // AI 병합 초안 생성 요청
  | 'AI_DRAFT_GENERATED'    // AI 병합 초안 전송 (백엔드 -> 프론트)
  | 'APPROVE_AI_DRAFT'      // AI 병합 초안 최종 반영 승인
  | 'OPEN_DIFF_EDITOR'      // 네이티브 VS Code Diff Editor 열기 요청
  | 'NOTIFICATION'          // 알림 전송 (백엔드 -> 프론트)
  | 'SET_CONFIG'            // 설정 변경 요청
  | 'GET_SUGGESTIONS'       // 커밋 메시지/브랜치명 추천 요청
  | 'SUGGESTIONS_UPDATED'   // 추천 목록 업데이트 전송
  | 'BRANCHES_UPDATED'      // 브랜치 목록 업데이트 (Phase 2)
  | 'AI_COMMIT_SUGGESTED'   // AI 커밋 메시지 추천 전송
  | 'EXECUTE_COMMIT'        // 커밋 실행 요청
  | 'DELETE_BRANCHES'       // 브랜치 삭제 요청
  | 'CREATE_SNAPSHOT'       // 수동 스냅샷 생성 요청
  | 'RENAME_SNAPSHOT'       // 스냅샷 이름 변경
  | 'DELETE_SNAPSHOT'       // 스냅샷 삭제 요청
  | 'TOGGLE_SNAPSHOT_STAR'  // 스냅샷 즐겨찾기 토글
  | 'GET_SNAPSHOT_FILES'    // 스냅샷 파일 목록 요청 (분석 결과)
  | 'OPEN_FILE_DIFF'        // 파일 비교(Diff) 실행 요청
  | 'EXECUTE_PULL';         // Pull 실행 요청

export interface GitCatMessage<T = any> {
  command: MessageCommand;
  payload?: T;
  requestId?: string;
}

/**
 * 스냅샷 데이터 인터페이스
 */
export interface Snapshot {
  id: string;
  title: string;
  timestamp: number;
  type: 'AI_TASK' | 'BEFORE_MERGE' | 'MANUAL' | 'SAFETY_BACKUP';
  isStarred: boolean;       // 즐겨찾기 여부
  changesCount: number;
  description?: string;
  reason?: string;          // 생성 사유 상세
  snapshotPath?: string;    // 실제 저장 경로 (Extension Host 내부용)
  files?: SnapshotFile[];   // 변경된 파일 목록 (상태 포함)
}

/**
 * 스냅샷 내 개별 파일 정보
 */
export interface SnapshotFile {
  path: string;
  status: 'MODIFIED' | 'ADDED' | 'DELETED';
}

/**
 * 충돌 분석 결과 인터페이스
 */
export interface ConflictAnalysis {
  filePath: string;
  lineRange: [number, number];
  severity: 'high' | 'medium' | 'low';
  reason: string;
  suggestion?: string;
}

/**
 * AI 병합 초안 인터페이스
 */
export interface AIDraft {
  id: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  mediationOpinion: string; // AI 중재 의견
}

/**
 * 브랜치 데이터 인터페이스 (Phase 2)
 */
export interface Branch {
  name: string;
  status: 'merged' | 'stale' | 'active';
  lastActivity: string;
}
