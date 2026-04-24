-- GitCat SQLite schema v1
-- 목적:
-- 1) 1단계(기반 구축)에서 필요한 메타데이터 테이블/인덱스 기본 골격 제공
-- 2) 팀 병렬 개발(backend1/backend2/frontend/ai) 시 공통 저장 계약 고정
--
-- 저장 경계:
-- - DB: 관계형 메타데이터(source of truth)
-- - 로컬 파일 시스템: 스냅샷 원본/병합 산출물의 큰 본문 데이터
--   (DB에는 artifact path만 저장)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_name TEXT,
  device_type TEXT,
  os_type TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS project_workspaces (
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
);

CREATE TABLE IF NOT EXISTS branches (
  branch_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  is_remote INTEGER NOT NULL DEFAULT 0,
  tracking_branch_name TEXT,
  last_commit_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE TABLE IF NOT EXISTS worktrees (
  worktree_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  is_main INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE TABLE IF NOT EXISTS worktree_instances (
  worktree_instance_id TEXT PRIMARY KEY,
  worktree_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (worktree_id) REFERENCES worktrees(worktree_id),
  FOREIGN KEY (branch_id) REFERENCES branches(branch_id)
);

CREATE TABLE IF NOT EXISTS work_sessions (
  session_id TEXT PRIMARY KEY,
  worktree_instance_id TEXT NOT NULL,
  session_type TEXT NOT NULL,
  base_snapshot_id TEXT,
  description TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  FOREIGN KEY (worktree_instance_id) REFERENCES worktree_instances(worktree_instance_id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  snapshot_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  is_checkpoint INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES work_sessions(session_id)
);

CREATE TABLE IF NOT EXISTS snapshot_files (
  snapshot_file_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  original_path TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id)
);

CREATE TABLE IF NOT EXISTS change_records (
  record_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  branch_name TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES work_sessions(session_id)
);

CREATE TABLE IF NOT EXISTS changed_files (
  changed_file_id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  change_type TEXT NOT NULL,
  location TEXT,
  summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (record_id) REFERENCES change_records(record_id)
);

CREATE TABLE IF NOT EXISTS restore_histories (
  restore_history_id TEXT PRIMARY KEY,
  target_snapshot_id TEXT NOT NULL,
  pre_restore_snapshot_id TEXT,
  restored_at TEXT NOT NULL,
  FOREIGN KEY (target_snapshot_id) REFERENCES snapshots(snapshot_id),
  FOREIGN KEY (pre_restore_snapshot_id) REFERENCES snapshots(snapshot_id)
);

CREATE TABLE IF NOT EXISTS merge_analyses (
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
);

CREATE TABLE IF NOT EXISTS conflict_candidates (
  candidate_id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line_start INTEGER,
  line_end INTEGER,
  detected_by TEXT NOT NULL,
  confidence_score REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (analysis_id) REFERENCES merge_analyses(analysis_id)
);

CREATE TABLE IF NOT EXISTS merge_proposals (
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
);

CREATE TABLE IF NOT EXISTS proposal_feedbacks (
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
);

CREATE TABLE IF NOT EXISTS recommendation_histories (
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
);

CREATE TABLE IF NOT EXISTS app_states (
  app_state_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  state_value_json TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  app_setting_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value_json TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_histories_project_type_created
  ON recommendation_histories(project_id, recommendation_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_feedbacks_project_decided
  ON proposal_feedbacks(project_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_merge_proposals_candidate_status
  ON merge_proposals(candidate_id, status);
CREATE INDEX IF NOT EXISTS idx_conflict_candidates_analysis
  ON conflict_candidates(analysis_id);
