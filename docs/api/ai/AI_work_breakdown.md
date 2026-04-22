# GitCat AI 파트 병렬 개발 기준 문서

## 1. 문서 목적

본 문서는 GitCat AI 파트의 병렬 개발을 위해, 이번 MVP에서 사용할 인터페이스 고정값과 mock 데이터 기준을 확정하기 위한 참고 문서이다.

본 문서의 목적은 다음과 같다.

- AI 파트 3인의 개발 경계면을 명확히 한다.
- 병렬 개발에 필요한 payload 계약을 최소 범위로 고정한다.
- 각 담당자가 상대 모듈 완료를 기다리지 않고 mock 기반으로 개발할 수 있게 한다.
- MVP에서 반드시 구현할 범위와 후순위 범위를 구분한다.

---

## 2. 왜 이 문서가 추가로 필요한가

AI 파트의 인터페이스 이름과 전체 구조는 이미 정해져 있다.

- ai_task_request
- ai_input_payload
- model_call_request
- parsed_ai_result
- proposal_feedback_payload

하지만 병렬 개발에서는 “인터페이스가 있다”만으로는 부족하다.

아래가 실제로 고정되어야 한다.

- 이번 MVP에서 반드시 쓰는 필드
- enum 값
- 조건부 필수 규칙
- ref 값 형식
- mock JSON 예시

즉, 본 문서는 기존 인터페이스 명세를 대체하는 문서가 아니라,  
**기존 명세 중 이번에 실제로 사용할 최소 계약본을 고정하는 문서**이다.

---

## 3. 개발 전제

### 3.1 프로젝트 전제
- GitCat은 VS Code Extension 기반 로컬 실행형 Git 보조 도구이다.
- 현재는 서버 없는 로컬 실행형 MVP를 기준으로 한다.
- 저장 구조는 SQLite, 로컬 파일 시스템, VSCode Storage로 분리한다.

### 3.2 AI 파트 MVP 핵심 기능
이번 MVP에서 AI 파트는 아래 기능을 우선한다.

1. 충돌 설명 생성
2. 중재 방향 제안
3. diff/patch 기반 병합 초안 생성
4. 사용자 수락/수정/거절 저장

### 3.3 이번 문서에서 고정하는 범위
이번 문서에서는 아래 4개를 병렬 개발용 핵심 인터페이스로 고정한다.

1. ai_task_request
2. ai_input_payload
3. parsed_ai_result
4. proposal_feedback_payload

`model_call_request`는 남주완 담당 내부 구현 범위로 두되,  
입력과 출력 경계면은 위 4개를 기준으로 삼는다.

---

## 4. 역할 분담

### 4.1 허서연
입력 수집과 AI 입력 스키마 담당

주요 책임:
- 세션 시작 시 입력 컨텍스트 수집
- AI 입력 payload 생성
- 충돌 후보와 관련 파일 목록 구성
- input mock 데이터 관리

### 4.2 남주완
프롬프트, 모델 호출, 응답 파싱 담당

주요 책임:
- ai_input_payload를 기반으로 프롬프트 작성
- 모델 호출
- 응답 파싱
- parsed_ai_result mock 및 실제 결과 구조 유지

### 4.3 신형섭
결과 표시, 사용자 피드백, 저장 담당

주요 책임:
- parsed_ai_result 기반 결과 표시
- 사용자 수락/수정/거절 처리
- proposal_feedback_payload 저장
- proposal / feedback 메타데이터 저장

---

## 5. 병렬 개발 기준

### 5.1 공통 원칙
- 각 담당자는 상대 구현 완료를 기다리지 않고 mock 데이터로 작업한다.
- 실제 구현보다 먼저 payload 형식을 맞춘다.
- 필드명, enum 값, ref 형식은 변경하지 않는다.
- 변경이 필요하면 문서 먼저 수정하고 합의 후 반영한다.

### 5.2 고정 경계면
아래 3개 연결점이 병렬 개발의 핵심 경계면이다.

- 허서연 → 남주완
  - ai_input_payload

- 남주완 → 신형섭
  - parsed_ai_result

- 신형섭 → 저장 계층
  - proposal_feedback_payload

---

## 6. 인터페이스 고정값

## 6.1 공통 규칙

### 네이밍
- payload 필드명은 snake_case를 사용한다.

### ID 형식
- session_id: `ais_YYYYMMDD_001`
- ai_request_id: `air_YYYYMMDD_001`
- proposal_id: `aip_YYYYMMDD_001`
- feedback_id: `fb_YYYYMMDD_001`

### ref 형식
로컬 원문 참조는 문자열 ref로 고정하며, 실제 로컬 파일 시스템 경로(`.vscode/gitcat/...`)와 매핑된다.

- diff ref: `diff://local/{session_id}/working.diff` (예: `.vscode/gitcat/snapshots/{session_id}/working.diff`)
- response ref: `response://local/{ai_request_id}/raw.json` (예: `.vscode/gitcat/ai/responses/{ai_request_id}.json`)
- patch ref: `patch://local/{proposal_id}/merge.patch` (예: `.vscode/gitcat/ai/patches/{proposal_id}.patch`)
- code ref: `code://local/{proposal_id}/merged.ts` (예: `.vscode/gitcat/ai/codes/{proposal_id}/merged.ts`)
- final code ref: `code://local/{feedback_id}/final.ts` (예: `.vscode/gitcat/ai/codes/{feedback_id}/final.ts`)

### confidence_score
- 0.0 ~ 1.0 범위의 number로 고정한다.

---

## 6.2 공통 enum 고정값

### feature_type
- conflict_explanation
- merge_mediation
- merge_patch_draft
- recommendation

### request_origin
- panel
- treeview
- command_palette
- inline_action

### trigger_source
- manual
- merge_detected
- restore_related
- recommendation_request

### proposal_status
- generated
- parsed
- displayed
- accepted
- edited
- rejected

### selection_status
- accepted
- edited
- rejected

### quality_tag
- useful
- partially_useful
- not_useful
- incorrect
- unsafe
- needs_followup

### risk_level
- low
- medium
- high
- critical

---

## 7. MVP 고정 인터페이스

## 7.1 ai_task_request

### 목적
사용자의 AI 요청을 세션 시작 단위로 표현하는 최소 입력 객체

### 필드
- project_id: string, 필수
- session_id: string, 필수
- feature_type: enum, 필수
- user_intent: string, 필수
- request_origin: enum, 필수
- trigger_source: enum, 필수
- requested_at: string(datetime), 필수

### 비고
- 이 객체는 UI 진입점에서 생성한다.
- 허서연 담당의 입력 수집 시작점으로 사용한다.

### mock 예시
```json
{
  "project_id": "proj_gitcat_local_01",
  "session_id": "ais_20260422_001",
  "feature_type": "merge_patch_draft",
  "user_intent": "두 브랜치 변경사항을 반영한 병합 초안을 만들어줘",
  "request_origin": "panel",
  "trigger_source": "manual",
  "requested_at": "2026-04-22T14:30:00+09:00"
}
```

## 7.2 ai_input_payload

### 목적
입력 수집 단계가 생성 단계에 넘기는 공통 payload이다.

### 이번 MVP 필수 필드
- `project_id`: string, 필수
- `session_id`: string, 필수
- `feature_type`: enum, 필수
- `current_branch`: string, 필수
- `target_branch`: string, 조건부 필수
- `workspace_summary`: string, 선택
- `related_files`: string array, 조건부 필수
- `conflict_candidates`: object array, 조건부 필수
- `working_tree_diff_ref`: string ref, 조건부 필수
- `risk_summary`: string, 선택
- `schema_version`: string, 필수

### 조건부 필수 규칙
- `feature_type`이 `merge_patch_draft`, `conflict_explanation`, `merge_mediation`이면 아래 필드는 필수이다.
  - `target_branch`
  - `related_files`
  - `conflict_candidates`
  - `working_tree_diff_ref`

### conflict_candidates 내부 객체 고정 필드
- `conflict_candidate_id`: string
- `file_path`: string
- `line_start`: number
- `line_end`: number
- `conflict_type`: string
- `reason_summary`: string
- `risk_level`: enum

### conflict_type 고정값
- `same_region`
- `adjacent_change`
- `signature_change`
- `shared_module_impact`
- `data_structure_change`

### mock 예시
```json
{
  "project_id": "proj_gitcat_local_01",
  "session_id": "ais_20260422_001",
  "feature_type": "merge_patch_draft",
  "current_branch": "feature/login-refactor",
  "target_branch": "develop",
  "workspace_summary": "로그인 응답 DTO와 예외 처리 로직이 함께 수정됨",
  "related_files": [
    "src/auth/service.ts",
    "src/auth/dto.ts",
    "src/auth/controller.ts"
  ],
  "conflict_candidates": [
    {
      "conflict_candidate_id": "cc_001",
      "file_path": "src/auth/service.ts",
      "line_start": 88,
      "line_end": 121,
      "conflict_type": "signature_change",
      "reason_summary": "로그인 응답 타입과 예외 반환 형태가 동시에 변경됨",
      "risk_level": "high"
    }
  ],
  "working_tree_diff_ref": "diff://local/ais_20260422_001/working.diff",
  "risk_summary": "함수 시그니처 변경으로 간접 충돌 가능성 높음",
  "schema_version": "v1"
}
```

## 7.3 parsed_ai_result

### 목적
모델 응답을 파싱한 뒤 표시 계층으로 넘기는 공통 결과 객체이다.

### 이번 MVP 필수 필드
- `proposal_id`: string, 필수
- `session_id`: string, 필수
- `ai_request_id`: string, 필수
- `feature_type`: enum, 필수
- `title`: string, 필수
- `summary`: string, 필수
- `explanation`: string, 선택
- `confidence_score`: number, 선택
- `proposal_status`: enum, 필수
- `parser_version`: string, 필수

### feature_type이 merge_patch_draft일 때 추가 필드
- `diff_patch_ref`: string ref, 조건부 필수
- `merged_code_ref`: string ref, 조건부 필수
- `applied_files`: string array, 선택
- `validation_required`: boolean, 선택
- `validation_summary`: string, 선택

규칙:
- `diff_patch_ref`와 `merged_code_ref` 중 최소 1개는 있어야 한다.

### feature_type이 conflict_explanation일 때 추가 필드
- `cause_summary`: string, 필수
- `detailed_explanation`: string, 선택
- `related_files`: string array, 선택
- `recommended_resolution_direction`: string, 선택
- `risk_level`: enum, 선택

### feature_type이 merge_mediation일 때 추가 필드
- `recommended_option`: string, 필수
- `tradeoffs`: string array, 선택
- `recommended_next_action`: string, 선택

### mock 예시 1: merge_patch_draft
```json
{
      "proposal_id": "aip_20260422_001",
      "session_id": "ais_20260422_001",
      "ai_request_id": "air_20260422_001",
      "feature_type": "merge_patch_draft",
      "title": "DTO 구조를 유지하면서 예외 처리 변경을 반영한 병합 초안",
      "summary": "develop의 응답 구조를 유지하고 feature 브랜치의 예외 처리 흐름을 선택 반영하는 안",
      "explanation": "공통 모듈 의존성을 고려하면 DTO 구조 변경을 최소화하는 것이 안전합니다.",
      "confidence_score": 0.82,
      "proposal_status": "parsed",
      "parser_version": "v1",
      "diff_patch_ref": "patch://local/aip_20260422_001/merge.patch",
      "merged_code_ref": "code://local/aip_20260422_001/merged.ts",
      "applied_files": [
        "src/auth/service.ts"
      ],
      "validation_required": true,
      "validation_summary": "LoginResponseDto 타입 확인 필요"
    }
```

### mock 예시 2: conflict_explanation
```json
    {
      "proposal_id": "aip_20260422_002",
      "session_id": "ais_20260422_002",
      "ai_request_id": "air_20260422_002",
      "feature_type": "conflict_explanation",
      "title": "로그인 응답 형식 변경으로 인한 간접 충돌 가능성",
      "summary": "동일 라인 충돌은 없지만 응답 DTO 변경과 예외 처리 포맷 변경이 연결 지점에서 충돌할 수 있습니다.",
      "explanation": "직접 충돌보다 인터페이스 불일치가 핵심 위험입니다.",
      "confidence_score": 0.79,
      "proposal_status": "parsed",
      "parser_version": "v1",
      "cause_summary": "응답 DTO 구조와 예외 처리 포맷이 동시에 변경됨",
      "detailed_explanation": "컨트롤러, 서비스, DTO 간 데이터 흐름에서 반환 형식이 달라질 수 있습니다.",
      "related_files": [
        "src/auth/dto.ts",
        "src/auth/controller.ts"
      ],
      "recommended_resolution_direction": "DTO 구조를 기준 브랜치에 맞추고 예외 처리만 선택 반영",
      "risk_level": "high"
    }
```
## 7.4 proposal_feedback_payload

### 목적
사용자의 최종 판단 결과를 저장 계층으로 넘기는 payload이다.

### 이번 MVP 필수 필드
- `feedback_id`: string, 필수
- `proposal_id`: string, 필수
- `selection_status`: enum, 필수
- `decided_at`: string(datetime), 필수

### 조건부 필수 필드
- `final_text`: string
- `final_code_ref`: string ref
- `final_explanation`: string

### 조건부 규칙
- `recommendation`에서 `accepted` 또는 `edited`이면 `final_text` 사용을 권장한다.
- `merge_patch_draft`에서 `edited`이면 `final_code_ref`는 필수이다.
- `conflict_explanation`, `merge_mediation`에서 `edited`이면 `final_explanation` 사용을 권장한다.

### 선택 필드
- `quality_tag`: enum
- `feedback_note`: string

### mock 예시 1: 병합 초안 수정 후 채택
```json
{
      "feedback_id": "fb_20260422_001",
      "proposal_id": "aip_20260422_001",
      "selection_status": "edited",
      "final_code_ref": "code://local/fb_20260422_001/final.ts",
      "final_explanation": "DTO는 develop 기준을 유지하고 예외 처리 로직만 선택 반영함",
      "quality_tag": "partially_useful",
      "feedback_note": "설명은 유용했지만 patch는 일부 수동 수정이 필요했음",
      "decided_at": "2026-04-22T14:40:00+09:00"
}
```

### mock 예시 2: 충돌 설명 수락
```json
{
      "feedback_id": "fb_20260422_002",
      "proposal_id": "aip_20260422_002",
      "selection_status": "accepted",
      "final_explanation": "응답 DTO 불일치를 우선 해결하기로 결정",
      "quality_tag": "useful",
      "feedback_note": "원인 설명이 충분히 명확했음",
      "decided_at": "2026-04-22T14:42:00+09:00"
    }
```
## 7.5 recommendation 확장 고정안

### 목적
커밋 메시지, 브랜치명, 작업 설명과 같은 협업 추천 기능을 위해 사용하는 입력/출력 기준을 고정한다.

현재 recommendation은 병합 기능과 같은 상위 인터페이스를 공유하되,  
입력 포인트와 결과 형식이 다르므로 recommendation 전용 최소 필드를 추가로 고정한다.

---

## 7.5.1 recommendation 기능 범위

### 이번 MVP에서 포함하는 추천 기능
- `commit_message_recommendation`
- `branch_name_recommendation`
- `work_description_recommendation`

### recommendation_type 고정값
- `commit_message`
- `branch_name`
- `work_description`

### feature_type 사용 규칙
기존 상위 인터페이스에서는 `feature_type`을 아래처럼 사용한다.

- `recommendation`

대신 recommendation 내부 세부 구분은 `recommendation_type`으로 분리한다.

즉:
- 상위 분기: `feature_type = recommendation`
- 세부 분기:
  - `recommendation_type = commit_message`
  - `recommendation_type = branch_name`
  - `recommendation_type = work_description`

---

## 7.5.2 ai_input_payload에서 recommendation일 때 추가 고정 필드

### 목적
병합 기능과 달리 recommendation은 충돌 후보보다 변경 요약과 작업 의도가 더 중요하므로, recommendation 전용 입력 필드를 추가한다.

### recommendation일 때 필수 필드
- `recommendation_type`: enum, 필수
- `change_summary`: string, 필수
- `changed_files`: string array, 필수
- `work_intent`: string, 필수

### recommendation일 때 선택 필드
- `diff_summary`: string, 선택
- `branch_context`: string, 선택
- `ticket_ref`: string, 선택
- `naming_constraints`: string array, 선택
- `message_constraints`: string array, 선택

### recommendation용 필드 의미

- `recommendation_type`
  - 추천 결과의 종류를 구분한다.

- `change_summary`
  - 전체 변경사항을 사람이 이해할 수 있게 짧게 요약한 문장이다.

- `changed_files`
  - 추천 생성의 근거가 되는 주요 변경 파일 목록이다.

- `work_intent`
  - 사용자가 이번 작업에서 무엇을 하려고 했는지 나타낸다.

- `diff_summary`
  - diff 전체를 그대로 넣는 대신 핵심 변경점만 요약한 보조 설명이다.

- `branch_context`
  - 현재 브랜치의 역할이나 작업 흐름을 나타내는 문장이다.

- `ticket_ref`
  - Jira 이슈 번호나 작업 ID와 같이 추천 텍스트에 반영할 수 있는 참조값이다.

- `naming_constraints`
  - 브랜치명 추천 시 형식 제약을 준다.
  - 예: `kebab-case`, `slash-prefix-required`, `english-only`

- `message_constraints`
  - 커밋 메시지 추천 시 형식 제약을 준다.
  - 예: `conventional-commit`, `subject-under-50`, `imperative-style`

---

## 7.5.3 recommendation 결과용 parsed_ai_result 추가 규칙

### recommendation일 때 필수 필드
- `recommendation_type`: enum, 필수
- `primary_text`: string, 필수
- `alternative_texts`: string array, 필수
- `generation_basis_summary`: string, 선택

### recommendation일 때 선택 필드
- `format_notes`: string, 선택
- `warnings`: string array, 선택

### 필드 의미
- `primary_text`
  - 가장 우선 추천하는 결과 1개

- `alternative_texts`
  - 대안 후보 목록

- `generation_basis_summary`
  - 어떤 변경 근거를 바탕으로 추천했는지 요약 설명

- `format_notes`
  - 형식상 참고할 점
  - 예: conventional commit 형식 반영

- `warnings`
  - 추천 사용 시 주의사항
  - 예: 브랜치명이 너무 길어질 수 있음

---

## 7.5.4 proposal_feedback_payload에서 recommendation일 때 규칙

### recommendation에서 필수/권장 규칙
- `selection_status`: 필수
- `final_text`: `accepted` 또는 `edited`이면 권장
- `final_explanation`: 선택
- `quality_tag`: 선택
- `feedback_note`: 선택

### recommendation 관련 저장 규칙
- 커밋 메시지 추천, 브랜치명 추천, 작업 설명 추천은 코드 파일 ref 대신 `final_text` 중심으로 저장한다.
- recommendation에서는 `final_code_ref`를 사용하지 않는다.

---

## 7.5.5 recommendation용 ai_input_payload mock 예시 1: 커밋 메시지 추천
```json
    {
      "project_id": "proj_gitcat_local_01",
      "session_id": "ais_20260422_101",
      "feature_type": "recommendation",
      "recommendation_type": "commit_message",
      "current_branch": "feature/login-refactor",
      "workspace_summary": "로그인 응답 DTO와 예외 처리 흐름을 정리함",
      "change_summary": "로그인 응답 DTO 구조를 정리하고 예외 처리 흐름을 개선함",
      "changed_files": [
        "src/auth/service.ts",
        "src/auth/dto.ts",
        "src/auth/errors.ts"
      ],
      "work_intent": "로그인 응답 형식을 정리하고 예외 반환 구조를 일관되게 맞추려는 작업",
      "diff_summary": "DTO 필드 구조 정리, 예외 메시지 생성 로직 수정, 서비스 반환 타입 보정",
      "branch_context": "인증 모듈 리팩토링 작업 중 일부",
      "ticket_ref": "GITCAT-42",
      "message_constraints": [
        "conventional-commit",
        "subject-under-50",
        "imperative-style"
      ],
      "schema_version": "v1"
    }
```
---

## 7.5.6 recommendation용 ai_input_payload mock 예시 2: 브랜치명 추천
```json
    {
      "project_id": "proj_gitcat_local_01",
      "session_id": "ais_20260422_102",
      "feature_type": "recommendation",
      "recommendation_type": "branch_name",
      "current_branch": "temp/work",
      "workspace_summary": "병합 충돌 설명 기능과 병합 초안 생성 UI를 연결하는 작업",
      "change_summary": "충돌 설명 패널과 병합 초안 결과 렌더링 로직을 연결함",
      "changed_files": [
        "src/webview/mergePanel.tsx",
        "src/application/aiProposalService.ts",
        "src/types/proposal.ts"
      ],
      "work_intent": "충돌 설명과 병합 초안 표시 기능을 묶어 사용자 검토 흐름을 만드는 작업",
      "diff_summary": "proposal result 렌더링, 액션 버튼 연결, 타입 정리",
      "branch_context": "AI 병합 지원 기능 개발",
      "ticket_ref": "GITCAT-57",
      "naming_constraints": [
        "kebab-case",
        "slash-prefix-required",
        "english-only"
      ],
      "schema_version": "v1"
    }
```
---

## 7.5.7 recommendation용 ai_input_payload mock 예시 3: 작업 설명 추천
```json
    {
      "project_id": "proj_gitcat_local_01",
      "session_id": "ais_20260422_103",
      "feature_type": "recommendation",
      "recommendation_type": "work_description",
      "current_branch": "feature/conflict-explain-ui",
      "workspace_summary": "충돌 설명 결과를 사용자에게 카드 형태로 보여주는 UI 작업",
      "change_summary": "충돌 원인, 관련 파일, 권장 해결 방향을 표시하는 결과 카드 UI를 구현함",
      "changed_files": [
        "src/webview/components/ConflictResultCard.tsx",
        "src/webview/hooks/useProposalViewModel.ts"
      ],
      "work_intent": "충돌 설명 결과를 사용자가 빠르게 이해하고 다음 행동을 결정할 수 있도록 정리하는 작업",
      "diff_summary": "결과 카드 컴포넌트 추가, view model 연결, 위험 수준 표시",
      "branch_context": "AI 결과 표시 개선",
      "ticket_ref": "GITCAT-61",
      "schema_version": "v1"
    }
```
---

## 7.5.8 parsed_ai_result mock 예시 1: 커밋 메시지 추천 결과
```json
    {
      "proposal_id": "aip_20260422_101",
      "session_id": "ais_20260422_101",
      "ai_request_id": "air_20260422_101",
      "feature_type": "recommendation",
      "recommendation_type": "commit_message",
      "title": "커밋 메시지 추천 결과",
      "summary": "로그인 응답 DTO 정리와 예외 처리 흐름 개선 작업을 반영한 커밋 메시지 제안",
      "explanation": "응답 구조 정리와 예외 처리 개선이 함께 반영되었으므로 auth 범주의 refactor 또는 fix 형태가 적절합니다.",
      "confidence_score": 0.86,
      "proposal_status": "parsed",
      "parser_version": "v1",
      "primary_text": "refactor(auth): align login dto and error flow",
      "alternative_texts": [
        "fix(auth): normalize login response and exceptions",
        "refactor(auth): clean up login response handling",
        "feat(auth): improve login response and error structure"
      ],
      "generation_basis_summary": "DTO 구조 정리, 예외 처리 흐름 수정, 인증 서비스 반환 타입 보정을 반영함",
      "format_notes": "conventional commit 형식과 50자 내외 subject 기준을 우선 반영함",
      "warnings": [
        "feat는 신규 기능으로 오해될 수 있어 refactor 또는 fix가 더 적절할 수 있음"
      ]
    }
```
---

## 7.5.9 parsed_ai_result mock 예시 2: 브랜치명 추천 결과
```json
    {
      "proposal_id": "aip_20260422_102",
      "session_id": "ais_20260422_102",
      "ai_request_id": "air_20260422_102",
      "feature_type": "recommendation",
      "recommendation_type": "branch_name",
      "title": "브랜치명 추천 결과",
      "summary": "충돌 설명 및 병합 초안 표시 흐름을 반영한 브랜치명 제안",
      "explanation": "AI 병합 지원 화면 연결 작업이므로 merge, conflict, proposal 같은 키워드를 포함하는 것이 적절합니다.",
      "confidence_score": 0.84,
      "proposal_status": "parsed",
      "parser_version": "v1",
      "primary_text": "feature/merge-proposal-flow",
      "alternative_texts": [
        "feature/conflict-proposal-ui",
        "feature/merge-explain-panel",
        "feature/ai-merge-review-flow"
      ],
      "generation_basis_summary": "충돌 설명 패널과 병합 초안 결과 렌더링을 묶는 사용자 흐름 작업을 반영함",
      "format_notes": "slash prefix와 kebab-case 제약을 반영함",
      "warnings": [
        "브랜치명이 너무 구체적이면 이후 작업 범위 확장 시 이름이 맞지 않을 수 있음"
      ]
    }
```
---

## 7.5.10 parsed_ai_result mock 예시 3: 작업 설명 추천 결과
```json
    {
      "proposal_id": "aip_20260422_103",
      "session_id": "ais_20260422_103",
      "ai_request_id": "air_20260422_103",
      "feature_type": "recommendation",
      "recommendation_type": "work_description",
      "title": "작업 설명 추천 결과",
      "summary": "충돌 설명 결과를 카드 형태 UI로 시각화하는 작업 설명 제안",
      "explanation": "사용자가 충돌 원인과 권장 해결 방향을 빠르게 파악할 수 있도록 결과 카드 중심으로 설명을 구성했습니다.",
      "confidence_score": 0.88,
      "proposal_status": "parsed",
      "parser_version": "v1",
      "primary_text": "충돌 설명 결과에서 원인 요약, 관련 파일, 권장 해결 방향을 카드 형태로 표시하고, 위험 수준을 함께 보여주도록 UI 흐름을 구성했다.",
      "alternative_texts": [
        "AI 충돌 설명 결과를 카드 UI로 정리하고, 사용자가 관련 파일과 해결 방향을 한눈에 확인할 수 있도록 결과 표시 구조를 개선했다.",
        "충돌 설명 결과의 핵심 정보를 시각적으로 정리하기 위해 결과 카드 컴포넌트를 추가하고 위험 수준 및 관련 파일 정보를 함께 노출했다."
      ],
      "generation_basis_summary": "충돌 설명 결과 표시 개선, 결과 카드 컴포넌트 추가, 위험 수준 표시를 반영함",
      "format_notes": "작업 설명은 지나치게 구현 세부보다 사용자 관점 결과가 드러나도록 구성함",
      "warnings": [
        "PR description으로 바로 쓰려면 변경 파일 또는 테스트 내용이 추가로 필요할 수 있음"
      ]
    }
```
---

## 7.5.11 proposal_feedback_payload mock 예시 1: 커밋 메시지 추천 수락
```json
    {
      "feedback_id": "fb_20260422_101",
      "proposal_id": "aip_20260422_101",
      "selection_status": "accepted",
      "final_text": "refactor(auth): align login dto and error flow",
      "final_explanation": "커밋 메시지 추천안 1번을 그대로 사용하기로 결정",
      "quality_tag": "useful",
      "feedback_note": "짧고 변경 의도가 잘 드러남",
      "decided_at": "2026-04-22T15:10:00+09:00"
    }
```
---

## 7.5.12 proposal_feedback_payload mock 예시 2: 브랜치명 추천 수정 후 채택
```json
    {
      "feedback_id": "fb_20260422_102",
      "proposal_id": "aip_20260422_102",
      "selection_status": "edited",
      "final_text": "feature/ai-merge-proposal-flow",
      "final_explanation": "AI 범위를 조금 더 명확히 드러내도록 브랜치명을 수정함",
      "quality_tag": "partially_useful",
      "feedback_note": "추천 방향은 좋았지만 작업 범위를 더 정확히 표현하고 싶었음",
      "decided_at": "2026-04-22T15:12:00+09:00"
    }
```
---

## 7.5.13 proposal_feedback_payload mock 예시 3: 작업 설명 추천 거절
```json
    {
      "feedback_id": "fb_20260422_103",
      "proposal_id": "aip_20260422_103",
      "selection_status": "rejected",
      "final_explanation": "이번에는 더 간단한 작업 설명이 필요해서 사용하지 않음",
      "quality_tag": "partially_useful",
      "feedback_note": "설명은 자연스럽지만 팀 문서 스타일보다 다소 길었음",
      "decided_at": "2026-04-22T15:15:00+09:00"
    }
```
---

## 7.5.14 recommendation 담당 범위 반영

### 허서연 추가 작업
- recommendation용 `ai_input_payload` 필드 구성
- `change_summary`, `changed_files`, `work_intent` 수집 기준 정의
- recommendation mock 입력 3종 작성

### 남주완 추가 작업
- `recommendation_type`별 프롬프트 템플릿 작성
- 커밋 메시지 / 브랜치명 / 작업 설명 추천 파서 작성
- recommendation 결과 mock 3종 작성

### 신형섭 추가 작업
- recommendation 결과 표시 UI 정의
- `primary_text`, `alternative_texts` 선택 흐름 구현
- recommendation용 `proposal_feedback_payload` 저장 처리

---

## 7.5.15 recommendation MVP 완료 기준

아래가 되면 recommendation 기능도 MVP 수준으로 본다.

1. `commit_message_recommendation` 1건 생성 가능
2. `branch_name_recommendation` 1건 생성 가능
3. `work_description_recommendation` 1건 생성 가능
4. 사용자가 추천안을 수락, 수정, 거절할 수 있음
5. 최종 선택 결과가 `proposal_feedback_payload`로 저장됨

---

## 8. 각 담당자별 개발 범위

## 8.1 허서연 담당 작업

### 이번 MVP에서 반드시 할 일
- `ai_task_request` 생성 입력 정리
- `ai_input_payload` 생성기 구현
- `related_files` 수집 규칙 정의
- `conflict_candidates` mock 및 실제 수집 구조 맞추기
- `working_tree_diff_ref` 생성 규칙 정의

### mock 기준 산출물
- `ai_task_request` mock JSON 2종
- `ai_input_payload` mock JSON 2종
- 병합 기능용 샘플 1개
- 충돌 설명 기능용 샘플 1개

### 완료 기준
- 남주완이 실제 Git 수집 구현 완료 전에도 input mock으로 개발 가능해야 한다.

---

## 8.2 남주완 담당 작업

### 이번 MVP에서 반드시 할 일
- `ai_input_payload` 기반 프롬프트 템플릿 작성
- 모델 호출 함수 구현
- 응답 파싱 후 `parsed_ai_result` 생성
- `merge_patch_draft` 결과 1종 파서 구현
- `conflict_explanation` 결과 1종 파서 구현

### mock 기준 산출물
- raw response mock 2종
- `parsed_ai_result` mock 2종
- `feature_type`별 파서 결과 샘플

### 완료 기준
- 신형섭이 실제 모델 호출 없이 `parsed_ai_result` mock으로 개발 가능해야 한다.

---

## 8.3 신형섭 담당 작업

### 이번 MVP에서 반드시 할 일
- `parsed_ai_result` 기반 결과 표시 구조 정의
- 수락/수정/거절 처리 흐름 구현
- `proposal_feedback_payload` 생성기 구현
- proposal / feedback 저장 메타데이터 연결

### mock 기준 산출물
- `parsed_ai_result` 입력 mock 기반 화면/저장 테스트
- `proposal_feedback_payload` mock 2종
- `edited` / `accepted` 케이스 각각 1개

### 완료 기준
- 실제 모델 연결 전에도 결과 표시와 저장 흐름이 동작해야 한다.

---

## 9. 선후관계

### 먼저 확정
1. 본 문서의 인터페이스 고정값
2. mock JSON 예시
3. enum 값

### 이후 병렬 개발
1. 허서연: input payload 생성
2. 남주완: prompt / call / parse
3. 신형섭: display / feedback / save

### 이후 연결
1. input mock → 실제 입력 연결
2. parsed result mock → 실제 LLM 결과 연결
3. feedback mock → 실제 저장 연결

---

## 10. 이번 MVP에서 제외하거나 후순위로 미루는 항목

아래는 이번 MVP에서 필수로 구현하지 않는다.

- `training_candidate_payload` 자동 생성
- DPO / SFT export
- local adapter mode
- 다중 모델 비교
- 고급 품질 자동 평가
- 세부 risk score 계산 자동화
- `change_records` 정교한 검색 최적화

---

## 11. 최종 목표

이번 문서 기준으로 AI 파트의 1차 목표는 아래와 같다.

### 목표 1
`merge_patch_draft` 기능 1건이 end-to-end로 동작한다.

### 목표 2
`conflict_explanation` 기능 1건이 end-to-end로 동작한다.

### 목표 3
사용자가 AI 결과를 수락, 수정, 거절할 수 있고 그 결과가 저장된다.

이 3개가 되면 GitCat AI 파트의 핵심 흐름인  
입력 → 생성 → 반영/저장 이 MVP 수준에서 검증된 것으로 본다.