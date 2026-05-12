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

### 분담 원칙
- 병합 충돌 해결 단계는 백엔드 1/2로 나누지 않고 하나의 백엔드가 기능 단위로 끝까지 구현한다.
- 이 단계는 단순 Git 명령 추가보다 계약 정리와 연결 흐름 구현이 핵심이다.
- 이미 구현된 Git merge 관련 기능은 재구현하지 않고 재사용한다.
- AI ↔ Extension, Webview ↔ Extension, DB 저장 모델은 목적별 DTO를 분리한다.
- 병합 AI 입력에서 `working_tree_diff_ref`, `context_bundle_ref` 같은 ref는 AI provider가 직접 로컬 파일을 읽기 위한 값이 아니다.
- Extension/backend orchestration 계층이 ref를 로컬 스토리지 artifact로 resolve/materialize한 뒤, 실제 코드 본문 또는 excerpt를 AI prompt 재료로 넘기는 구조를 우선한다.
- SQLite에는 병합 분석/제안/피드백의 메타데이터, 상태, 요약, artifact path/ref만 저장하고, 긴 diff·코드 본문·prompt 원문·AI 산출물은 로컬 파일 스토리지에 저장한다.
- `worktree_instance_id`는 Git에서 직접 조회되는 값이 아니라, GitCat이 `worktree + branch` 조합을 추적하기 위해 생성하는 내부 식별자다.

---

### 티켓 4-1. 병합 계약 정리 및 DTO 통일

#### 티켓명
[BE] 병합 계약 정리 및 DTO 통일

#### 해야 할 일
- `ANALYZE_CONFLICT` 입력 계약 확정
- Extension → AI 입력을 `MergeProposalInputSchema` 기준으로 정리
- Extension → Webview 출력은 화면용 projection DTO로 분리
- `CONFLICT_RESULT`, `MERGE_PROPOSAL`, `MERGE_COMPLETE` payload 재정의
- `REJECT_AI_DRAFT`와 `REJECT_MERGE` 중 하나를 표준 메시지로 통일
- shared-types / AI DTO / Webview store가 같은 규약을 쓰도록 정리

#### 단계 종료 후 연결
- AI 담당은 `MergeProposalInputSchema` 기준 입력을 받을 수 있다.
- 프론트 담당은 병합용 projection DTO 기준으로 UI를 붙일 수 있다.

---

### 티켓 4-2. 병합 입력 조합 서비스 구현

#### 티켓명
[BE] 병합 입력 조합 서비스 구현

#### 해야 할 일
- source / target / session / worktree context 수집
- `getMergeBase`, `getDiff`, `getDiffText` 기반 입력 assembler 구현
- 병합 분석용 raw data 조합
- AI 병합 제안용 raw data 조합
- `session_id`가 필수인 현재 AI 입력 계약 반영
- `working_tree_diff_ref`와 `context_bundle_ref`를 AI 입력 계약에 포함하되, 실제 로컬 스토리지 저장/조회는 다음 작업에서 구현
- `context_bundle_ref`는 충돌 후보 파일 본문, 주변 코드, import/type/interface, 관련 테스트/의존 파일 excerpt를 묶는 로컬 artifact의 연결점으로 사용
- 충돌 분석 service와 AI 제안 service가 공통으로 사용할 입력 모델 정리

#### 단계 종료 후 연결
- 충돌 분석 service가 바로 사용할 입력 구조가 준비된다.
- AI 병합 제안 입력 raw data가 준비된다.
- 다음 작업에서는 `context_bundle_ref`가 가리키는 실제 코드 context bundle을 로컬 스토리지에 생성하고, AI 호출 직전 resolve/materialize하는 흐름을 구현한다.

---

### 티켓 4-3. 병합 분석 저장 구조 보강

#### 티켓명
[BE] 병합 분석 저장 구조 보강

#### 해야 할 일
- `MergeAnalysisRepository`, `ConflictCandidateRepository`, `MergeProposalRepository`, `ProposalFeedbackRepository` 구현 상태 점검
- 기존 구현 재사용 가능 여부 확인
- 없는 repository만 보강
- export / DI 연결
- `analysis_artifact_path`, `proposals_artifact_path` 저장 흐름 연결
- DB에는 메타데이터 / 상태 / 경로 / 요약만 저장하는 원칙 유지

#### 단계 종료 후 연결
- 분석/제안/피드백 service가 사용할 repository 구조가 정리된다.
- 로컬 산출물 경로와 DB 메타데이터 연결이 가능해진다.

---

### 티켓 4-4. 충돌 후보 분석 핸들러·서비스 구현

#### 티켓명
[BE] 충돌 후보 분석 핸들러·서비스 구현

#### 해야 할 일
- `ANALYZE_CONFLICT` handler 구현
- merge base 계산
- diff 비교
- 충돌 후보 탐지
- `conflict_candidates` 저장
- `analysis.json` 경로 저장
- `CONFLICT_RESULT`를 Webview projection DTO 기준으로 응답

#### 단계 종료 후 연결
- 프론트 담당은 충돌 후보 목록 UI를 붙일 수 있다.
- AI 담당은 충돌 후보 결과를 병합 제안 입력으로 사용할 수 있다.

---

### 티켓 4-5. AI 병합 제안 및 피드백 흐름 구현

#### 티켓명
[BE] AI 병합 제안 및 피드백 흐름 구현

#### 해야 할 일
- `MergeProposalService` 구현
- AI 입력은 `MergeProposalInputSchema` 기준으로 조합
- AI 호출 직전 `context_bundle_ref`를 resolve하여 로컬 스토리지의 코드 context bundle을 읽고, prompt에 실제 코드 본문/excerpt가 포함되도록 materialize
- AI provider 또는 순수 ai-pipeline이 VS Code workspace의 로컬 파일을 직접 읽지 않도록 한다.
- ai-pipeline은 전달받은 materialized payload/prompt context를 검증, 토큰 최적화, prompt 생성, parser 처리하는 책임에 집중한다.
- AI 결과는 parser 결과 모델 기준으로 수신
- DB에는 메타데이터 / 요약 / 상태 저장
- 실제 제안 코드와 긴 설명은 `proposals.json`에 저장
- `MERGE_PROPOSAL` 응답 연결
- `ACCEPT_MERGE` / `REJECT_MERGE` 처리
- `proposal_feedbacks` 저장
- 과거 feedback을 이후 AI 참고 이력으로 조회 가능한 구조 준비

#### 단계 종료 후 연결
- AI 담당은 병합 제안 생성 / explanation 생성 / feedback 반영 품질을 붙일 수 있다.
- 프론트 담당은 Accept / Reject UI를 붙일 수 있다.

---

### 티켓 4-6. 병합 실행 및 최종 상태 반영 구현

#### 티켓명
[BE] 병합 실행 및 최종 상태 반영 구현

#### 해야 할 일
- 기존 `RUN_MERGE`, `MERGE_ABORT`, `MERGE_CONTINUE` 흐름 재사용
- Accept된 제안 반영 후 병합 실행
- Reject된 제안은 feedback만 저장하고 conflict 유지 가능하도록 처리
- conflict marker 재스캔
- `MERGE_COMPLETE`, 오류 응답, 상태 갱신 응답 정리
- 병합 완료 / 미완료 / abort / continue 상태를 Webview projection DTO 기준으로 반영

#### 단계 종료 후 연결
- 프론트 담당은 병합 실행/완료/오류 상태 UI를 붙일 수 있다.
- 병합 완료 이후 상태 갱신까지 end-to-end 흐름이 맞춰진다.

---

### 프론트 연결 시점
- 티켓 4-1 완료 후: 병합용 payload/DTO 기준으로 UI 연결 가능
- 티켓 4-4 완료 후: 충돌 후보 목록 UI 연결 가능
- 티켓 4-5 완료 후: 병합안 비교, Accept / Reject UI 연결 가능
- 티켓 4-6 완료 후: 병합 실행 및 완료 상태 UI 연결 가능

### AI 연결 시점
- 티켓 4-1 완료 후: 병합 입력/출력 계약 기준 합의 가능
- 티켓 4-2 완료 후: AI 입력용 raw data 전달 가능
- 티켓 4-5 완료 후: 병합 제안 생성과 feedback 반영 품질 연결 가능
---

# 최종 목표
- 백엔드 1은 실행/Git/파일/세션 흐름을 안정화한다.
- 백엔드 2는 데이터 구조와 추천/병합 이력 구조를 안정화한다.
- 각 단계 종료마다 프론트와 AI가 바로 붙을 수 있는 연결 포인트를 제공한다.
