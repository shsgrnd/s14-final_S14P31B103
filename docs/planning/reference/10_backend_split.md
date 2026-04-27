# GitCat MVP 백엔드 작업 분담서

## 목적
백엔드 개발자 2명이 공통 프롬프트의 단계 순서를 유지하면서 비슷한 속도로 병렬 개발할 수 있도록 책임과 연결 시점을 정의한다.

---

## 공통 원칙
- 개발 순서는 아래 4단계로 고정한다.
  1. 기반 구축
  2. 세이프티 레이어
  3. 추천 기능
  4. 병합 충돌 해결
- 각 단계에서는 그 단계에 필요한 필수 구현만 한다.
- 다음 단계에 필요한 로직/테이블/핸들러는 다음 단계에서 구현한다.
- 프론트(Webview), AI 파트와 연결 가능한 최소 껍데기와 계약만 먼저 맞춘다.
- 공통 타입, 메시지 규약, DTO, enum 변경은 반드시 합의 후 반영한다.

---

## 역할 요약

### 백엔드 1
- Extension Host 실행 구조
- VS Code command / event 등록
- Git 연동
- 로컬 파일 저장소
- 세션 / 스냅샷 / 원복 / 체크포인트
- Git / Snapshot 관련 메시지 핸들러

### 백엔드 2
- 공통 타입 / DTO / schema
- SQLite 스키마 / repository
- Secrets / settings abstraction
- 추천 이력 / 제안 피드백 이력
- 추천 서비스 / 병합 메타데이터 서비스
- 추천 / 병합 관련 메시지 핸들러

---

# 단계별 분담

## 1단계. 기반 구축

### 백엔드 1
- VS Code Extension 기본 실행 구조
- extension entry
- command registry
- event registry 뼈대
- Webview 패널 오픈 연결
- message router 뼈대
- GitClient / GitService 인터페이스 뼈대
- 로컬 파일 저장소 디렉터리 서비스 뼈대

### 백엔드 2
- shared 타입 / enum / DTO 뼈대
- Zod schema 뼈대
- SQLite schema 초기 버전
- repository interface 뼈대
- Settings / Secrets abstraction 뼈대
- recommendation_histories / proposal_feedbacks를 포함한 DB 모델 뼈대

### 단계 종료 후 연결
- 백엔드 1의 message router와 백엔드 2의 DTO/schema를 연결
- extension entry에서 공통 service 주입 구조 맞춤

### 프론트 연결 시점
- 이 단계 끝나면 프론트는 Webview placeholder와 postMessage 송수신을 붙일 수 있다.

### AI 연결 시점
- 아직 실제 연결하지 않음
- AIClient interface와 request/response schema만 맞춰둔다

---

## 2단계. 세이프티 레이어

### 백엔드 1
- WorkSession 시작/종료
- 수동 편집 / AI 작업 세션 분기
- 변경 파일 추적
- 최초 변경 전 상태 저장
- 통합 스냅샷 생성
- 체크포인트 지정/해제
- pre_restore snapshot 생성
- 선택 스냅샷 원복
- snapshot 파일 로컬 저장 구조 구현

### 백엔드 2
- work_sessions / snapshots / snapshot_files / change_records / changed_files / restore_histories repository 구현
- 세이프티 레이어용 DTO 및 query model 구현
- snapshot / restore 메타데이터 저장 서비스 구현
- snapshot list / detail / checkpoint / restore history 조회 서비스 구현

### 단계 종료 후 연결
- 백엔드 1의 실제 파일 저장 로직과 백엔드 2의 snapshot/restore repository 연결
- snapshotId, sessionId, restoreHistoryId 흐름 맞춤

### 프론트 연결 시점
- 이 단계 끝나면 프론트는 스냅샷 목록, 체크포인트 표시, 원복 버튼, 원복 이력 UI를 붙일 수 있다.

### AI 연결 시점
- 아직 실제 연결하지 않음
- 다만 세션/변경기록 컨텍스트를 다음 단계 추천 입력으로 넘길 준비만 한다

---

## 3단계. 추천 기능

### 백엔드 1
- staged diff 수집
- branch list / current branch / log / 비교 대상 기초 데이터 수집
- 추천 요청 전 Git 상태/입력 데이터 수집 service
- 추천 메시지 라우팅
- RECOMMEND_COMMIT / RECOMMEND_BRANCH / RECOMMEND_PR 요청/응답 배선

### 백엔드 2
- recommendation_histories repository 구현 완료
- recommendation service 구현
- AIClient interface 기반 추천 orchestration
- 과거 recommendation_histories 조회 및 참고 로직
- 추천 요청/응답 DTO, schema, validator 구현
- 추천 실패/재시도/오류 응답 규약 구현

### 단계 종료 후 연결
- 백엔드 1이 수집한 diff/base/commit/log 입력을 백엔드 2 recommendation service에 전달
- recommendation result를 message router로 Webview에 전달

### 프론트 연결 시점
- 이 단계 끝나면 프론트는 브랜치명/커밋명/PR description 추천 결과 UI를 붙일 수 있다.

### AI 연결 시점
- 이 단계에서 AI 담당과 첫 본격 연동
- AI 담당은 provider 호출, prompt template, parser 품질을 붙인다

---

## 4단계. 병합 충돌 해결

### 백엔드 1
- source/target 선택용 Git/브랜치/워크트리 데이터 수집
- merge base / diff / merge command 실행 배선
- 병합 전후 Git 상태 재조회
- conflict marker 재스캔 트리거
- merge artifact 로컬 파일 저장 경로 생성
- ANALYZE_CONFLICT / RUN_MERGE / ACCEPT_MERGE / REJECT_MERGE 메시지 배선

### 백엔드 2
- merge_analyses / conflict_candidates / merge_proposals / proposal_feedbacks repository 구현 완료
- ConflictAnalyzer orchestration
- MergeAnalysisService
- MergeProposalService
- ProposalFeedbackService
- 과거 proposal_feedbacks 조회 및 참고 로직
- 병합 결과 DTO / schema / validator 구현
- analysis.json / proposals.json 경로 메타데이터 관리

### 단계 종료 후 연결
- 백엔드 1의 Git diff/merge 결과를 백엔드 2 병합 분석 서비스에 전달
- 백엔드 2의 conflict/proposal 결과를 백엔드 1 라우터로 전달
- proposal_feedback 저장 흐름까지 맞춘다

### 프론트 연결 시점
- 이 단계 끝나면 프론트는 충돌 후보 목록, 병합안 비교, Accept/Reject, 병합 실행 UI를 붙일 수 있다.

### AI 연결 시점
- 이 단계에서 AI 담당과 두 번째 본격 연동
- AI 담당은 병합 제안 생성, explanation 생성, feedback 반영 품질을 붙인다

---

# 충돌 방지 규칙

## 백엔드 1이 임의 변경하면 안 되는 것
- SQLite schema 구조
- repository 인터페이스 명세
- recommendation_histories / proposal_feedbacks 데이터 구조
- shared DTO / enum 핵심 값

## 백엔드 2가 임의 변경하면 안 되는 것
- extension entry / command registration 구조
- Git adapter 구조
- 실제 snapshot 파일 저장 규칙
- event hook 구조

---

# 단계별 산출물 체크

## 1단계 완료 기준
- extension 실행 가능
- Webview placeholder 표시 가능
- shared 타입 / schema / DB init 가능

## 2단계 완료 기준
- 세션 생성 가능
- 스냅샷 생성 / 조회 / 원복 가능
- 프론트에서 snapshot UI 연동 가능

## 3단계 완료 기준
- 추천 요청/응답 배선 가능
- recommendation history 저장/조회 가능
- AI 담당 연결 가능

## 4단계 완료 기준
- 충돌 분석 / 제안 / 피드백 저장 가능
- 병합 UI 연동 가능
- AI 담당 연결 가능

---

# 최종 목표
- 백엔드 1은 실행과 파일/세션/Git 흐름을 안정화한다.
- 백엔드 2는 데이터 구조와 추천/병합 이력 구조를 안정화한다.
- 각 단계 종료마다 프론트와 AI가 바로 붙을 수 있는 연결 포인트를 제공한다.