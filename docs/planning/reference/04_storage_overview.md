# 전체 저장소 구조도

## 저장소 구성
1. SQLite
2. 로컬 파일 시스템
3. VS Code Secrets
4. Extension 보조 상태 저장(globalState, 선택적)

---

## 1. SQLite

### 역할
- 관계형 메타데이터 저장
- 조회/정렬/필터링
- 세션/스냅샷/병합분석/추천 이력의 관계 추적

### 현재 저장 대상
- users
- devices
- app_states
- app_settings
- projects
- project_workspaces
- branches
- worktrees
- worktree_instances
- work_sessions
- snapshots
- snapshot_files
- change_records
- changed_files
- restore_histories
- merge_analyses
- conflict_candidates
- merge_proposals
- proposal_feedbacks
- recommendation_histories

### DB에 저장해야 하는 것
- 식별자
- FK 관계
- 상태값 / 유형값 / 사유값
- 경로
- 해시
- 시간
- 짧은 제목/요약/설명
- 추천/병합 제안의 검색 가능한 메타데이터
- 사용자의 선택 결과와 후속 피드백 메타데이터

### DB에 저장하지 않는 것이 더 적절한 것
- 실제 스냅샷 파일 본문
- 병합 분석 상세 원문 JSON
- 병합 제안 전체 코드 본문
- 병합 제안의 긴 설명 원문

---

## 2. 로컬 파일 시스템

### 역할
- 실제 원복 가능한 스냅샷 원본 파일 복사본 저장
- 병합 분석 산출물 저장
- 병합 제안 산출물 저장
- 임시 비교/전처리 파일 저장

### 현재 저장 대상
- snapshot_files.stored_path 가 가리키는 실제 스냅샷 원본 파일 복사본
- merge-sessions/{analysisId}/analysis.json
- merge-sessions/{analysisId}/proposals.json
- merge-sessions/{analysisId}/summary.json
- temp 디렉터리의 임시 작업 파일

### 현재 로컬에 존재하지만 DB가 경로만 들고 있는 것
- 실제 Git 워크스페이스 디렉터리
- 실제 Git 루트 디렉터리
- 실제 worktree 디렉터리
- 실제 snapshot originals 디렉터리

---

## 3. VS Code Secrets

### 역할
- 민감정보 저장

### 현재 저장 대상
- 사용자 AI API Key

---

## 4. Extension 보조 상태 저장(globalState, 선택적)

### 역할
- 아주 가벼운 확장 로컬 상태/캐시
- source of truth 아님

### 사용 가능 범위
- 마지막 선택 탭
- 일시적 UI 상태
- 임시 캐시 키

### 사용 금지 범위
- 세션/스냅샷/병합분석의 최종 메타데이터
- 관계형 조회가 필요한 데이터
- 사용자 비밀값

---

## 현재 저장 원칙 요약

| 데이터 종류 | 저장 위치 |
|---|---|
| 관계형 메타데이터 | SQLite |
| 실제 스냅샷 파일 본문 | 로컬 파일 시스템 |
| 병합 분석/병합 제안 큰 본문 | 로컬 파일 시스템 |
| 사용자 AI API Key | VS Code Secrets |
| 아주 가벼운 UI/임시 상태 | globalState (선택적) |

---

## AI 이력 저장 원칙
- recommendation_histories는 DB 저장 유지
- proposal_feedbacks는 DB 저장 유지
- 두 테이블은 이후 AI 요청 시 참고 이력으로 조회 가능해야 한다
- 단, 실제 제안 코드 전체나 긴 설명 원문은 DB가 아니라 로컬 proposals.json에 저장한다