/**
 * GitCat SQLite 데이터베이스 테이블 스키마 정의 (DDL)
 * 
 * 참고 문서: docs/architecture/data/08_ERD_SQLITE.md
 * 총 15개의 엔티티를 생성하며, 크게 4가지 영역으로 나뉩니다:
 * 1. 코어(Core): 프로젝트, 세션, 스냅샷 관리
 * 2. 병합(Merge): 병합 분석 및 충돌 후보 관리
 * 3. AI 피드백(AI): AI 추론 모델 호출 이력 및 사용자 피드백 관리
 * 4. 설정(Setting): 전역 앱 상태 및 설정 관리
 */
export const SCHEMAS = [
  // ==========================================
  // 1. CORE (코어 시스템)
  // ==========================================
  `CREATE TABLE IF NOT EXISTS Project (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS Session (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES Project(id)
  );`,
  `CREATE TABLE IF NOT EXISTS Snapshot (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    branch_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES Session(id)
  );`,
  `CREATE TABLE IF NOT EXISTS SnapshotFile (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    FOREIGN KEY(snapshot_id) REFERENCES Snapshot(id)
  );`,
  `CREATE TABLE IF NOT EXISTS ChangeRecord (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES Session(id),
    FOREIGN KEY(snapshot_id) REFERENCES Snapshot(id)
  );`,
  `CREATE TABLE IF NOT EXISTS ChangedFile (
    id TEXT PRIMARY KEY,
    change_record_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    FOREIGN KEY(change_record_id) REFERENCES ChangeRecord(id)
  );`,
  `CREATE TABLE IF NOT EXISTS RestoreHistory (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL,
    restored_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(snapshot_id) REFERENCES Snapshot(id)
  );`,

  // ==========================================
  // 2. MERGE ANALYSIS (병합 분석)
  // ==========================================
  `CREATE TABLE IF NOT EXISTS MergeAnalysis (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    base_branch TEXT NOT NULL,
    target_branch TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES Session(id)
  );`,
  `CREATE TABLE IF NOT EXISTS ConflictCandidate (
    id TEXT PRIMARY KEY,
    merge_analysis_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    FOREIGN KEY(merge_analysis_id) REFERENCES MergeAnalysis(id)
  );`,

  // ==========================================
  // 3. AI & FEEDBACK (AI 추론 및 피드백 추적)
  // ==========================================
  // AI 모델 1회 호출 단위의 토큰/응답시간 기록
  `CREATE TABLE IF NOT EXISTS InferenceRun (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    tokens_used INTEGER,
    latency_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,
  // AI가 생성한 병합 초안 (Conflict 1개당 1개)
  `CREATE TABLE IF NOT EXISTS MergeProposal (
    id TEXT PRIMARY KEY,
    conflict_candidate_id TEXT NOT NULL,
    inference_run_id TEXT NOT NULL,
    proposal_content TEXT NOT NULL,
    FOREIGN KEY(conflict_candidate_id) REFERENCES ConflictCandidate(id),
    FOREIGN KEY(inference_run_id) REFERENCES InferenceRun(id)
  );`,
  // 커밋 메시지/브랜치명 등 단순 텍스트 추천 이력
  `CREATE TABLE IF NOT EXISTS RecommendationHistory (
    id TEXT PRIMARY KEY,
    inference_run_id TEXT NOT NULL,
    recommended_text TEXT NOT NULL,
    FOREIGN KEY(inference_run_id) REFERENCES InferenceRun(id)
  );`,
  // AI 추천 결과에 대한 사용자의 최종 판단(수락/거절/수정) 저장 (학습 파이프라인용 핵심 데이터)
  `CREATE TABLE IF NOT EXISTS ProposalFeedback (
    id TEXT PRIMARY KEY,
    proposal_id TEXT,
    recommendation_id TEXT,
    status TEXT NOT NULL,
    user_modified_content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,

  // ==========================================
  // 4. SETTINGS (앱 설정 및 상태)
  // ==========================================
  `CREATE TABLE IF NOT EXISTS AppSetting (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS AppState (
    state_key TEXT PRIMARY KEY,
    state_value TEXT NOT NULL
  );`
];
