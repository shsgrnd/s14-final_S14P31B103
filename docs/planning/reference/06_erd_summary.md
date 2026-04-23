# ERD 요약

## 핵심 엔티티

### 계정/기기/설정
- users
- devices
- app_states
- app_settings

### 프로젝트/로컬 경로/브랜치/워크트리
- projects
- project_workspaces
- branches
- worktrees
- worktree_instances

### 세션/스냅샷/변경 이력
- work_sessions
- snapshots
- snapshot_files
- change_records
- changed_files
- restore_histories

### 병합 분석 / AI 결과
- merge_analyses
- conflict_candidates
- merge_proposals
- proposal_feedbacks
- recommendation_histories

---

## 관계 핵심
- users 1:N devices
- users 1:N projects
- projects 1:N project_workspaces
- projects 1:N branches
- projects 1:N worktrees
- worktrees 1:N worktree_instances
- branches 1:N worktree_instances
- worktree_instances 1:N work_sessions
- work_sessions 1:N snapshots
- work_sessions 1:N change_records
- change_records 1:N changed_files
- snapshots 1:N snapshot_files
- snapshots 1:N restore_histories
- merge_analyses 1:N conflict_candidates
- conflict_candidates 1:N merge_proposals
- merge_proposals 1:N proposal_feedbacks
- merge_analyses 는 `source_worktree_instance_id` / `target_worktree_instance_id` 두 개를 참조
- projects 1:N recommendation_histories

---

## 현재 목표 해석 기준

### WorkSession
- 특정 WorktreeInstance를 기준으로 생성되는 작업 단위
- 수동 편집 / AI 작업 세션 포함

### Snapshot
- Session 종료 또는 특정 시점에 생성되는 결과 저장본
- 실제 파일 내용은 로컬 저장
- DB는 메타데이터와 파일 매핑만 저장

### ChangeRecord
- Session 동안 누적된 변경 기록
- 상세 파일 단위는 changed_files에서 관리

### MergeAnalysis
- source / target 두 WorktreeInstance 비교 단위
- 병합 분석 상태와 merge base를 저장
- 큰 분석 산출물은 로컬 merge-sessions 디렉터리에 저장

### ConflictCandidate
- 병합 분석에서 탐지된 충돌 후보 구간
- DB에는 후보 식별, 위치, 탐지 방식만 저장
- 자세한 코드 조각과 원문 산출물은 로컬 analysis.json에 저장

### MergeProposal
- 충돌 후보에 대한 병합 제안 결과
- DB에는 제안 식별, 제목, feature_type, 요약, 상태, 검증 정보 등을 저장
- 실제 제안 코드 본문은 로컬 proposals.json에 저장

### ProposalFeedback
- 사용자가 병합 제안을 어떻게 선택/수정했는지 저장
- 이후 병합 AI가 참고할 수 있는 핵심 이력

### RecommendationHistory
- 브랜치명 / 커밋명 / PR 설명 추천 이력 저장
- 이후 일반 추천 AI가 참고할 수 있는 핵심 이력

---

## 현재 enum 성격 컬럼
- work_sessions.session_type
- work_sessions.status
- snapshots.reason
- changed_files.change_type
- merge_analyses.status
- recommendation_histories.recommendation_type
- merge_proposals.status
- proposal_feedbacks.selection_status
- proposal_feedbacks.quality_tag

---

## 현재 저장 경계
- snapshot_files.stored_path → 로컬 파일 시스템
- merge_analyses.analysis_artifact_path → 로컬 analysis.json 경로
- merge_analyses.proposals_artifact_path → 로컬 proposals.json 경로
- recommendation_histories.result_text → 현재는 DB 저장
- proposal_feedbacks.final_code_ref → 로컬 산출물 또는 최종 코드 참조 경로