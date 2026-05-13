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
/**
 * 스키마 버전
 *
 * 스키마 변경(DDL 수정) 시 이 값을 올링하면 기존 DB를 자동으로 DROP 후 재생성한다.
 * MVP에서는 데이터 보존보다 완전한 스키마 동기화를 우선한다.
 */
export const SCHEMA_VERSION = 3;

export const SCHEMAS = [
  // 스키마 버전 관리 테이블 (가장 먼저 생성)
  `CREATE TABLE IF NOT EXISTS gitcat_schema_version (
    version INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_name TEXT,
    device_type TEXT,
    os_type TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
  );`,
  `CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
  );`,
  `CREATE TABLE IF NOT EXISTS project_workspaces (
    project_workspace_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    workspace_root_path TEXT NOT NULL,
    git_root_path TEXT NOT NULL,
    last_opened_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(device_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
  );`,
  `CREATE TABLE IF NOT EXISTS branches (
    branch_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    is_remote INTEGER NOT NULL DEFAULT 0,
    tracking_branch_name TEXT,
    last_commit_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    UNIQUE(project_id, branch_name)
  );`,
  `CREATE TABLE IF NOT EXISTS worktrees (
    worktree_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    is_main INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_opened_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
  );`,
  `CREATE TABLE IF NOT EXISTS worktree_instances (
    worktree_instance_id TEXT PRIMARY KEY,
    worktree_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (worktree_id) REFERENCES worktrees(worktree_id),
    FOREIGN KEY (branch_id) REFERENCES branches(branch_id)
  );`,
  `CREATE TABLE IF NOT EXISTS work_sessions (
    session_id TEXT PRIMARY KEY,
    worktree_instance_id TEXT NOT NULL,
    session_type TEXT NOT NULL,
    base_snapshot_id TEXT,
    description TEXT,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    FOREIGN KEY (worktree_instance_id) REFERENCES worktree_instances(worktree_instance_id)
  );`,
  `CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    previous_snapshot_id TEXT,
    reason TEXT,
    summary TEXT,
    local_path TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES work_sessions(session_id),
    FOREIGN KEY (previous_snapshot_id) REFERENCES snapshots(snapshot_id)
  );`,
  `CREATE TABLE IF NOT EXISTS snapshot_files (
    snapshot_file_id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL,
    original_path TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content_hash TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id)
  );`,
  `CREATE TABLE IF NOT EXISTS change_records (
    record_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    branch_name TEXT,
    description TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES work_sessions(session_id)
  );`,
  `CREATE TABLE IF NOT EXISTS changed_files (
    changed_file_id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL,
    location TEXT,
    summary TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (record_id) REFERENCES change_records(record_id)
  );`,
  `CREATE TABLE IF NOT EXISTS restore_histories (
    restore_history_id TEXT PRIMARY KEY,
    target_snapshot_id TEXT NOT NULL,
    pre_restore_snapshot_id TEXT,
    restored_at TEXT NOT NULL,
    FOREIGN KEY (target_snapshot_id) REFERENCES snapshots(snapshot_id),
    FOREIGN KEY (pre_restore_snapshot_id) REFERENCES snapshots(snapshot_id)
  );`,
  `CREATE TABLE IF NOT EXISTS merge_analyses (
    analysis_id TEXT PRIMARY KEY,
    source_worktree_instance_id TEXT NOT NULL,
    target_worktree_instance_id TEXT NOT NULL,
    merge_base TEXT,
    status TEXT NOT NULL,
    analysis_artifact_path TEXT,
    proposals_artifact_path TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_worktree_instance_id) REFERENCES worktree_instances(worktree_instance_id),
    FOREIGN KEY (target_worktree_instance_id) REFERENCES worktree_instances(worktree_instance_id)
  );`,
  `CREATE TABLE IF NOT EXISTS conflict_candidates (
    candidate_id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    detected_by TEXT NOT NULL,
    confidence_score REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (analysis_id) REFERENCES merge_analyses(analysis_id)
  );`,
  `CREATE TABLE IF NOT EXISTS merge_proposals (
    proposal_id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL,
    ai_request_id TEXT,
    file_path TEXT NOT NULL,
    feature_type TEXT NOT NULL,
    title TEXT NOT NULL,
    explanation_summary TEXT,
    confidence_score REAL,
    validation_required INTEGER NOT NULL DEFAULT 0,
    validation_summary TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (candidate_id) REFERENCES conflict_candidates(candidate_id)
  );`,
  `CREATE TABLE IF NOT EXISTS proposal_feedbacks (
    feedback_id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    merge_proposal_id TEXT,
    selection_status TEXT NOT NULL,
    final_text TEXT,
    final_code_ref TEXT,
    final_explanation TEXT,
    quality_tag TEXT,
    feedback_note TEXT,
    decided_at TEXT NOT NULL,
    FOREIGN KEY (proposal_id) REFERENCES merge_proposals(proposal_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    FOREIGN KEY (merge_proposal_id) REFERENCES merge_proposals(proposal_id)
  );`,
  `CREATE TABLE IF NOT EXISTS recommendation_histories (
    recommendation_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    session_id TEXT,
    ai_request_id TEXT,
    recommendation_type TEXT NOT NULL,
    input_summary TEXT,
    result_text TEXT NOT NULL,
    alternative_texts_json TEXT,
    generation_basis_summary TEXT,
    followup_notes TEXT,
    warnings_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    FOREIGN KEY (session_id) REFERENCES work_sessions(session_id)
  );`,
  `CREATE TABLE IF NOT EXISTS app_states (
    app_state_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    state_key TEXT NOT NULL,
    state_value_json TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(device_id)
  );`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    app_setting_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value_json TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(device_id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_recommendation_histories_project_type_created
    ON recommendation_histories(project_id, recommendation_type, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_proposal_feedbacks_project_decided
    ON proposal_feedbacks(project_id, decided_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_merge_proposals_candidate_status
    ON merge_proposals(candidate_id, status);`,
  `CREATE INDEX IF NOT EXISTS idx_conflict_candidates_analysis
    ON conflict_candidates(analysis_id);`,
  `CREATE INDEX IF NOT EXISTS idx_work_sessions_instance_status_started
    ON work_sessions(worktree_instance_id, status, started_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_session_created
    ON snapshots(session_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_snapshot_files_snapshot
    ON snapshot_files(snapshot_id);`,
  `CREATE INDEX IF NOT EXISTS idx_change_records_session_created
    ON change_records(session_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_changed_files_record
    ON changed_files(record_id);`,
  `CREATE INDEX IF NOT EXISTS idx_restore_histories_target_restored
    ON restore_histories(target_snapshot_id, restored_at DESC);`
];
