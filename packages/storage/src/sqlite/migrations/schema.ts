/**
 * GitCat SQLite 데이터베이스 테이블 스키마 정의 (DDL)
 *
 * 참고 문서:
 * - docs/architecture/data/08_ERD_SQLITE.md
 * - docs/api/ai/AI_work_breakdown.md
 * - docs/api/ai/11_ai_payload_schema.csv
 * - docs/api/ai/11_ai_db_schema.csv
 *
 * 원칙:
 * - SQLite에는 조회/이력 관리용 메타데이터만 저장한다.
 * - 코드 본문, diff/patch, raw response 같은 대용량 산출물은 로컬 파일에 저장하고
 *   DB에는 *_ref 컬럼으로 참조만 남긴다.
 *
 * TODO(core-storage):
 * - 아래 AI 관련 컬럼은 인프라/AI 담당자가 문서 기준으로 먼저 정리한 저장 계약 초안이다.
 * - packages/storage 최종 ownership을 가진 Core 담당자와 함께 repository 계층/호출 흐름에 맞춰
 *   컬럼명, nullable 여부, 인덱스, 마이그레이션 전략을 최종 확정해야 한다.
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
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES Session(id)
  );`,
  `CREATE TABLE IF NOT EXISTS SnapshotFile (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    stored_path TEXT,
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
    change_type TEXT,
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
    merge_base TEXT,
    status TEXT,
    source_worktree_instance_id TEXT,
    target_worktree_instance_id TEXT,
    analysis_artifact_path TEXT,
    proposal_artifact_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES Session(id)
  );`,
  `CREATE TABLE IF NOT EXISTS ConflictCandidate (
    id TEXT PRIMARY KEY,
    merge_analysis_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    conflict_type TEXT,
    reason_summary TEXT,
    risk_level TEXT,
    detected_by TEXT,
    source_code_ref TEXT,
    target_code_ref TEXT,
    base_code_ref TEXT,
    FOREIGN KEY(merge_analysis_id) REFERENCES MergeAnalysis(id)
  );`,

  // ==========================================
  // 3. AI & FEEDBACK (AI 추론 및 피드백 추적)
  // ==========================================
  // TODO(core-storage): ai_request_id FK 대상 테이블이 정식으로 추가되면 외래키 연결을 보강한다.
  // AI 모델 1회 호출 단위의 메타데이터 및 응답 참조 기록
  `CREATE TABLE IF NOT EXISTS InferenceRun (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    ai_request_id TEXT,
    parent_inference_run_id TEXT,
    run_type TEXT NOT NULL,
    input_summary TEXT,
    status TEXT,
    tokens_used INTEGER,
    latency_ms INTEGER,
    response_ref TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES Session(id),
    FOREIGN KEY(parent_inference_run_id) REFERENCES InferenceRun(id)
  );`,
  // TODO(core-storage): title/explanation_summary/diff_patch_ref/merged_code_ref는
  // AI 결과 표시 및 피드백 저장을 위한 초안 필드다. 실제 repository 설계 시 저장/조회 책임을 재검토한다.
  // AI가 생성한 병합 초안 메타데이터. 실제 코드/patch는 로컬 파일 참조로 저장한다.
  `CREATE TABLE IF NOT EXISTS MergeProposal (
    id TEXT PRIMARY KEY,
    conflict_candidate_id TEXT NOT NULL,
    inference_run_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    feature_type TEXT NOT NULL,
    title TEXT,
    explanation_summary TEXT,
    diff_patch_ref TEXT,
    merged_code_ref TEXT,
    confidence_score REAL,
    validation_required INTEGER DEFAULT 0,
    validation_summary TEXT,
    status TEXT NOT NULL,
    parsed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(conflict_candidate_id) REFERENCES ConflictCandidate(id),
    FOREIGN KEY(inference_run_id) REFERENCES InferenceRun(id)
  );`,
  // 커밋 메시지/브랜치명/작업 설명 추천 결과 이력
  `CREATE TABLE IF NOT EXISTS RecommendationHistory (
    id TEXT PRIMARY KEY,
    inference_run_id TEXT NOT NULL,
    recommendation_type TEXT NOT NULL,
    result_summary TEXT,
    result_text TEXT,
    response_ref TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(inference_run_id) REFERENCES InferenceRun(id)
  );`,
  // TODO(core-storage): edited_fields는 현재 TEXT(JSON 또는 구분자 문자열) 후보 상태다.
  // Core 담당자와 저장 포맷을 합의한 뒤 repository 단에서 직렬화 규칙을 고정한다.
  // AI 결과에 대한 사용자의 최종 판단(수락/수정/거절) 저장
  `CREATE TABLE IF NOT EXISTS ProposalFeedback (
    id TEXT PRIMARY KEY,
    proposal_id TEXT,
    recommendation_id TEXT,
    session_id TEXT NOT NULL,
    selection_status TEXT NOT NULL,
    final_text TEXT,
    final_code_ref TEXT,
    final_explanation TEXT,
    quality_tag TEXT,
    edited_fields TEXT,
    feedback_note TEXT,
    decided_by TEXT DEFAULT 'local_user',
    decided_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(proposal_id) REFERENCES MergeProposal(id),
    FOREIGN KEY(recommendation_id) REFERENCES RecommendationHistory(id),
    FOREIGN KEY(session_id) REFERENCES Session(id)
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
