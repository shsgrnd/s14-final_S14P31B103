# 10_backend_split.md

# GitCat MVP 백엔드 작업 분담서

## 목적
백엔드 개발자 2명이 공통 프롬프트의 단계 순서를 유지하면서 병렬로 개발할 수 있도록 책임과 연결 시점을 정의한다.

---

## 공통 원칙
- 개발 순서는 아래 4단계로 고정한다.
  1. 핵심 Git 작업(GUI)
  2. 추천 기능
  3. 세이프티 레이어
  4. 병합 충돌 해결
- 각 단계에서는 그 단계에 필요한 필수 구현만 한다.
- 다음 단계에 필요한 로직/테이블/핸들러는 다음 단계에서 구현한다.
- 프론트(Webview), AI 파트와 연결 가능한 최소 껍데기와 계약만 먼저 맞춘다.
- 공통 타입, 메시지 규약, DTO, enum 변경은 반드시 합의 후 반영한다.
- 실제 작업을 시작하기 전, 각 담당자는 **프로젝트 폴더와 참조 문서를 직접 읽고 현재 구현 상태를 파악한 뒤**, 자신이 명령받은 단계의 작업만 진행한다.

---

## 역할 요약

### 백엔드 1
- Extension Host 실행 구조
- Git 연동
- GUI 기반 Git 명령 실행 흐름
- 로컬 파일 저장소
- 세션 / 스냅샷 / 원복 / 체크포인트
- Git / Snapshot 관련 메시지 핸들러

### 백엔드 2
- 공통 타입 / DTO / schema
- SQLite 스키마 / repository 계층
- Secrets / settings abstraction
- 추천 이력 / 제안 피드백 이력
- 추천 서비스 / 병합 메타데이터 서비스
- 추천 / 병합 관련 메시지 핸들러

---

# 단계별 분담

## 1단계. 핵심 Git 작업(GUI)

### 백엔드 1
- Git 상태 조회
- 브랜치 목록 조회
- 브랜치 생성 / 삭제 / 전환
- add / stage / unstage
- commit 실행
- push 실행
- stash save / pop / apply / drop
- 기본 merge / merge abort / merge continue
- Git 관련 command / message handler 연결
- Webview가 바로 붙을 수 있는 Git 상태/명령 응답 구조 정리

### 백엔드 2
- Git 관련 request/response DTO 및 validator 보강
- branch / worktree / workspace 메타데이터 repository 정리
- Git 작업 결과를 저장/참조하는 최소 query model 정리
- Git 메시지 응답 모델 정리
- 오류 코드/실패 응답 구조 정리
- command 실행 결과를 프론트가 소비하기 좋은 형태로 표준화

### 단계 종료 후 연결
- 백엔드 1의 실제 Git 실행 결과를
- 백엔드 2의 DTO / validator / 응답 모델과 맞춘다.

### 프론트 연결 시점
- 이 단계 끝나면 프론트는
  - branch 목록
  - 현재 상태
  - add/commit/push/stash/merge 버튼
  - 실행 결과/오류 메시지 UI
  를 붙일 수 있다.

### AI 연결 시점
- 아직 본격 연결하지 않음
- 단, 추천 기능에서 사용할 staged diff / branch / log 수집 구조만 준비한다.

---

## 2단계. 추천 기능

### 분담 원칙
- 추천 기능은 **기능 단위 세로분리**로 진행한다.
- 각 담당자는 자신이 맡은 추천 기능에 대해
  - Git 데이터 수집
  - 핸들러 / 라우터 연결
  - 서비스 구현
  - recommendation_histories 저장 / 조회
  - Webview 응답 전달
  까지 한 흐름으로 책임진다.
- AI 담당은
  - 백엔드가 넘긴 raw data를 받아
  - 프롬프트 입력으로 가공하고
  - 외부 AI 호출 후
  - 추천 응답 payload를 조립해
  - 백엔드에 반환한다.
- 백엔드는 AI 응답을 받아 validator 검증 후 history 저장 및 Webview 전달을 담당한다.

### 백엔드 1
#### 담당 기능
- 브랜치명 추천
- 커밋명 추천

#### 작업 범위
- `RECOMMEND_BRANCH` 핸들러
- `RECOMMEND_COMMIT` 핸들러
- 추천 요청 전 필요한 Git 데이터 수집
  - branch 추천: 작업 목적, 현재 branch, branch list
  - commit 추천: staged diff, current branch, recent commits/log
- branch / commit recommendation service 구현
- recommendation_histories 저장 / 조회 연동
- 추천 결과 DTO 변환 및 Webview 응답 전달
- 실패 / 로딩 / 성공 응답 처리

### 백엔드 2
#### 담당 기능
- PR description 추천

#### 작업 범위
- `RECOMMEND_PR` 핸들러
- 추천 요청 전 필요한 Git 데이터 수집
  - base 비교 정보
  - diff
  - current branch
  - recent commits/log
- PR recommendation service 구현
- recommendation_histories 저장 / 조회 연동
- 추천 결과 DTO 변환 및 Webview 응답 전달
- 실패 / 로딩 / 성공 응답 처리

### 단계 종료 후 연결
- 백엔드 1의 branch / commit 추천 흐름과
- 백엔드 2의 PR 추천 흐름이
공통 recommendation_histories / AIClient / message protocol 위에서 일관되게 동작해야 한다.

### 프론트 연결 시점
- 이 단계 끝나면 프론트는
  - 브랜치명 추천 UI
  - 커밋명 추천 UI
  - PR description 추천 UI
  를 각각 바로 붙일 수 있다.

### AI 연결 시점
- 이 단계에서 AI 담당과 첫 본격 연동
- AI 담당은
  - provider 호출
  - prompt template
  - parser 품질
  을 recommendation service contract에 맞춰 붙인다.

---

## 3단계. 세이프티 레이어

### 백엔드 1
- WorkSession 시작/종료
- 수동 편집 세션 / AI 작업 세션 분기
- 세션별 변경 파일 추적
- 최초 변경 전 상태 저장
- 통합 스냅샷 생성
- 체크포인트 지정/해제
- 원복 전 pre_restore snapshot 생성
- 선택 스냅샷 원복
- .vscode/gitcat/snapshots 구조 실제 구현
- snapshot 파일 저장/조회/삭제 로직
- Snapshot / Restore 관련 메시지 핸들러 연결

### 백엔드 2
- work_sessions / snapshots / snapshot_files / change_records / changed_files / restore_histories repository 구현
- 세이프티 레이어용 DTO 및 query model 구현
- snapshot / restore 메타데이터 저장 서비스 구현
- snapshot list / detail / checkpoint / restore history 조회 서비스 구현

### 단계 종료 후 연결
- 백엔드 1의 실제 파일 저장 로직과
- 백엔드 2의 session/snapshot/restore repository 연결

### 프론트 연결 시점
- 이 단계 끝나면 프론트는
  - 스냅샷 목록
  - 체크포인트 표시
  - 원복 버튼
  - 원복 이력
  UI를 붙일 수 있다.

### AI 연결 시점
- 아직 병합 AI 본격 연결은 아님
- 다만 세션/변경기록 컨텍스트를 이후 병합 단계에서 참고할 수 있게 준비한다.

---

## 4단계. 병합 충돌 해결

### 백엔드 1
- source/target 선택용 Git/브랜치/워크트리/워크트리 인스턴스 데이터 수집
- merge base 계산용 Git adapter 연결
- diff/merge command 실행 배선
- git merge / merge continue / merge abort 실행 배선
- conflict marker 재스캔 트리거
- merge artifact 로컬 경로 생성
- ANALYZE_CONFLICT / RUN_MERGE / ACCEPT_MERGE / REJECT_MERGE 메시지 라우팅
- 병합 관련 결과를 Webview로 넘기는 최소 흐름 구현

### 백엔드 2
- merge_analyses / conflict_candidates / merge_proposals / proposal_feedbacks repository 구현
- MergeAnalysisService 구현
- ConflictAnalyzer orchestration interface 구현
- MergeProposalService 구현
- ProposalFeedbackService 구현
- 과거 proposal_feedbacks를 현재 병합 제안 입력의 참고 데이터로 조회하는 서비스 구현
- analysis_artifact_path / proposals_artifact_path 메타데이터 관리
- ANALYZE_CONFLICT / CONFLICT_RESULT / MERGE_PROPOSAL / ACCEPT_MERGE / REJECT_MERGE 관련 DTO, validator, handler 구현

### 단계 종료 후 연결
- 백엔드 1의 Git diff/merge 결과를 백엔드 2 병합 분석 서비스에 전달
- 백엔드 2의 conflict/proposal 결과를 백엔드 1 라우터로 전달
- proposal_feedback 저장 흐름까지 맞춘다

### 프론트 연결 시점
- 이 단계 끝나면 프론트는
  - 충돌 후보 목록
  - 병합안 비교
  - Accept/Reject
  - 병합 실행
  UI를 붙일 수 있다.

### AI 연결 시점
- 이 단계에서 AI 담당과 두 번째 본격 연동
- AI 담당은 병합 제안 생성, explanation 생성, feedback 반영 품질을 붙인다.

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
- 실제 snapshot / merge artifact 파일 저장 규칙
- event hook 구조

---

# 단계별 산출물 체크

## 1단계 완료 기준
- Git GUI 핵심 기능 실행 가능
- branch / add / commit / push / stash / merge 기본 흐름 가능
- 프론트에서 Git 작업 UI 연동 가능

## 2단계 완료 기준
- 추천 요청/응답 배선 가능
- recommendation history 저장/조회 가능
- AI 담당 연결 가능

## 3단계 완료 기준
- 세션 생성 가능
- 스냅샷 생성 / 조회 / 원복 가능
- 프론트에서 snapshot UI 연동 가능

## 4단계 완료 기준
- 충돌 분석 / 제안 / 피드백 저장 가능
- 병합 UI 연동 가능
- AI 담당 연결 가능

---

# 최종 목표
- 백엔드 1은 실행/Git/파일/세션 흐름을 안정화한다.
- 백엔드 2는 데이터 구조와 추천/병합 이력 구조를 안정화한다.
- 각 단계 종료마다 프론트와 AI가 바로 붙을 수 있는 연결 포인트를 제공한다.