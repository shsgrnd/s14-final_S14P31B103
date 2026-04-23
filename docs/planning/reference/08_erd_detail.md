# ERD 상세 명세

## 이 문서가 필요한 이유
현재 최종 ERD는
- 프로젝트
- 로컬 경로
- 브랜치
- 워크트리
- 워크트리 인스턴스
- 세션
- 스냅샷
- 변경 기록
- 병합 분석
- 병합 제안
- 제안 피드백
- 추천 기록
까지 포함해 구조가 복잡하다.

따라서 단순 요약만으로는
- 어떤 엔티티가 어떤 역할인지
- 어떤 컬럼이 메타데이터인지
- 어떤 값이 로컬 파일을 가리키는지
- 어떤 테이블이 AI 참고 이력인지
를 이해하기 어렵기 때문에 상세 명세 문서가 필요하다.

---

## 1. users
### 역할
서비스 사용자 계정의 최상위 엔티티

### 주요 컬럼
- user_id
- email
- name
- created_at
- updated_at

### 관계
- devices의 부모
- projects의 부모

---

## 2. devices
### 역할
사용자의 기기 식별 정보 저장

### 주요 컬럼
- device_id
- user_id
- device_name
- device_type
- os_type
- created_at
- updated_at

### 관계
- users에 종속
- project_workspaces, app_states, app_settings와 연결

---

## 3. projects
### 역할
논리 프로젝트 엔티티

### 주요 컬럼
- project_id
- user_id
- project_name

### 관계
- branches, worktrees, project_workspaces, recommendation_histories의 부모

---

## 4. project_workspaces
### 역할
특정 기기에서 특정 프로젝트가 어느 로컬 경로에 존재하는지 저장

### 주요 컬럼
- project_workspace_id
- device_id
- project_id
- workspace_root_path
- git_root_path
- last_opened_at

### 특징
- 경로 자체는 로컬 파일 시스템 자원
- DB는 그 주소만 저장

---

## 5. branches
### 역할
프로젝트 하위 브랜치 메타데이터

### 주요 컬럼
- branch_id
- project_id
- branch_name
- is_remote
- tracking_branch_name
- last_commit_hash

---

## 6. worktrees
### 역할
프로젝트 하위 워크트리 메타데이터

### 주요 컬럼
- worktree_id
- project_id
- worktree_path
- is_main
- is_active
- last_opened_at

### 특징
- 실제 경로는 로컬 파일 시스템
- DB는 주소와 상태만 저장

---

## 7. worktree_instances
### 역할
브랜치와 워크트리의 실제 연결 단위

### 주요 컬럼
- worktree_instance_id
- worktree_id
- branch_id

### 의미
- 어떤 브랜치가 어떤 워크트리에서 작업 중인지 나타내는 실행 단위

---

## 8. work_sessions
### 역할
작업 세션 엔티티

### 주요 컬럼
- session_id
- worktree_instance_id
- session_type
- base_snapshot_id
- description
- status
- started_at
- ended_at

### 관계
- snapshots의 부모
- change_records의 부모

---

## 9. snapshots
### 역할
세션 종료 또는 특정 시점에 생성되는 스냅샷 메타데이터

### 주요 컬럼
- snapshot_id
- session_id
- reason
- is_checkpoint
- label
- created_at

### 저장 경계
- DB: 메타데이터
- 로컬: 실제 파일 원본 복사본

---

## 10. snapshot_files
### 역할
스냅샷에 포함된 파일 매핑 정보

### 주요 컬럼
- snapshot_file_id
- snapshot_id
- original_path
- stored_path
- file_name
- content_hash

### 저장 경계
- DB는 파일 매핑 정보 저장
- 파일 본문은 로컬 파일 시스템 저장

---

## 11. change_records
### 역할
세션 내 변경 기록의 상위 엔티티

### 주요 컬럼
- record_id
- session_id
- branch_name
- description
- created_at

---

## 12. changed_files
### 역할
변경 기록에 포함된 파일 상세 정보

### 주요 컬럼
- changed_file_id
- record_id
- file_path
- change_type
- location
- summary

---

## 13. restore_histories
### 역할
원복 실행 이력

### 주요 컬럼
- restore_history_id
- target_snapshot_id
- pre_restore_snapshot_id
- restored_at

---

## 14. merge_analyses
### 역할
병합 분석 작업 단위

### 주요 컬럼
- analysis_id
- source_worktree_instance_id
- target_worktree_instance_id
- merge_base
- status
- analysis_artifact_path
- proposals_artifact_path
- created_at

### 의미
- source / target 두 작업 대상을 비교하는 부모 엔티티
- 큰 분석/제안 산출물은 로컬 파일로 관리하고 DB는 참조 경로를 가진다

---

## 15. conflict_candidates
### 역할
병합 분석 결과로 나온 충돌 후보

### 주요 컬럼
- candidate_id
- analysis_id
- file_path
- line_start
- line_end
- detected_by

### 저장 경계
- DB: 후보 식별, 위치, 탐지 방식
- 로컬: 상세 코드 조각 및 원문

---

## 16. merge_proposals
### 역할
병합 제안 결과 저장

### 주요 컬럼
- proposal_id
- candidate_id
- ai_request_id
- file_path
- feature_type
- title
- explanation_summary
- confidence_score
- validation_required
- validation_summary
- status
- created_at

### 저장 경계
- DB: proposal 상태와 요약 메타데이터
- 로컬: 실제 제안 코드 본문과 긴 explanation

---

## 17. proposal_feedbacks
### 역할
사용자가 병합 제안을 어떻게 선택/수정했는지 저장

### 주요 컬럼
- feedback_id
- proposal_id
- project_id
- merge_proposal_id
- selection_status
- final_text
- final_code_ref
- final_explanation
- quality_tag
- feedback_note
- decided_at

### 의미
- 어떤 제안을 수락/수정/거절했는지 저장
- 이후 AI 병합 제안 시 참고하는 피드백 데이터셋

### 저장 경계
- DB: 선택 결과, 품질 태그, 짧은 설명, 코드 참조
- 로컬: 필요 시 final_code_ref가 가리키는 실제 코드 산출물

---

## 18. recommendation_histories
### 역할
브랜치명 / 커밋명 / PR 설명 추천 이력 저장

### 주요 컬럼
- recommendation_id
- project_id
- session_id
- ai_request_id
- recommendation_type
- input_summary
- result_text
- alternative_texts
- generation_basis_summary
- followup_notes
- warnings
- created_at

### 의미
- 일반 추천 이력 저장
- 이후 추천 AI가 이전 결과를 참고할 수 있는 데이터셋

---

## 19. app_states / app_settings
### 역할
기기 단위 앱 상태/설정 저장용 보조 엔티티

### 현재 판단
- 구현 단계에서 SQLite 유지 또는 globalState 축소 여부 재검토 가능
- 핵심 도메인보다 우선순위 낮음