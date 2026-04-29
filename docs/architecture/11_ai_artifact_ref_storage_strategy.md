# 11. AI Artifact Ref 저장 / 수집 기준서

## 문서 개요

본 문서는 GitCat MVP에서 사용하는 AI artifact ref의 의미, 생성 시점, 로컬 파일 저장 기준, 후속 학습 후보 수집 범위를 정의한다.

기존 `AI_work_breakdown.md`는 작업 분해와 임시 정리에 가깝기 때문에, 본 문서를 AI artifact ref와 학습 후보 수집 전략의 공식 기준서로 사용한다.

본 문서는 다음 질문에 대한 공용 기준을 제공한다.

- `diff_patch_ref`, `final_code_ref`, `prompt_ref`, `chosen_ref`, `rejected_ref`는 각각 무엇을 의미하는가
- 각 ref는 어느 시점에 생성되는가
- 각 ref는 어디에 저장되며 어떤 payload와 연결되는가
- 현재 스프린트에서 즉시 수집 가능한 범위는 어디까지인가
- 후속 SQLite 연계 시 어떤 링크를 추가하면 되는가

---

## 참조 문서

- `docs/api/ai/11_ai_payload_schema.csv`
- `docs/api/ai/11_ai_db_schema.csv`
- `docs/api/ai/11_common_enum_spec.csv`
- `docs/architecture/07_storage_architecture.md`
- `docs/architecture/10_file_storage_convention.md`
- `docs/architecture/data/08_ERD_SQLITE.md`

---

## 1. Artifact Ref 정의

| Ref | 의미 | 생성 시점 | 연결 payload / 레코드 | 현재 저장 위치 |
| --- | --- | --- | --- | --- |
| `diff_patch_ref` | AI가 처음 제안한 merge patch 원본 artifact ref | `parsed_ai_result` 저장 직전 | `merge_proposals.diff_patch_ref` | `.vscode/gitcat/merge-sessions/{sessionId}/ai-results/{proposalId}/` |
| `final_code_ref` | 사용자가 수정 또는 채택한 최종 코드 artifact ref | `proposal_feedback_payload` 생성 직전 | `proposal_feedback_payload.final_code_ref` / `proposal_feedbacks.final_code_ref` | `.vscode/gitcat/merge-sessions/{sessionId}/feedback-results/{feedbackId}/` |
| `prompt_ref` | 학습 후보 생성 시 사용한 입력 prompt artifact ref | `training_candidate_payload` 생성 직전 | `training_candidate_payload.prompt_ref` | `.vscode/gitcat/training-candidates/{trainingCandidateId}/` |
| `chosen_ref` | 학습 후보에서 채택본으로 사용하는 artifact ref | `training_candidate_payload` 생성 직전 | `training_candidate_payload.chosen_ref` | `.vscode/gitcat/training-candidates/{trainingCandidateId}/` |
| `rejected_ref` | DPO 학습 후보에서 비교용 비채택 artifact ref | `training_candidate_payload` 생성 직전 | `training_candidate_payload.rejected_ref` | `.vscode/gitcat/training-candidates/{trainingCandidateId}/` |

### 정의 원칙

- `diff_patch_ref`는 **AI가 제안한 원본**을 가리킨다.
- `final_code_ref`는 **사용자가 최종 채택한 코드 결과물**을 가리킨다.
- `chosen_ref`와 `rejected_ref`는 **학습 후보 생성 시점의 학습용 참조**이며, proposal 원본 ref와 동일 개념이 아니다.
- 동일한 코드 결과물을 재사용하더라도, proposal 저장용 ref와 training candidate 저장용 ref는 목적이 다르므로 분리할 수 있다.

---

## 2. Feature Type별 최종 신호

| feature_type | 사용자 최종 신호 | 학습 후보 chosen 기준 |
| --- | --- | --- |
| `merge_patch_draft` | `final_code_ref` | 최종 채택 코드 artifact |
| `recommendation` | `final_text` | 최종 채택 텍스트를 저장한 artifact |
| `conflict_explanation` | `final_explanation` | 최종 채택 설명 artifact |
| `merge_mediation` | `final_explanation` | 현재 MVP에서는 training candidate 자동 생성 대상 아님 |

### 해석 기준

- `merge_patch_draft`는 코드 결과가 핵심이므로 `final_code_ref`가 주 신호다.
- `recommendation`은 짧은 자연어 결과가 핵심이므로 `final_text`를 chosen artifact로 저장한다.
- `conflict_explanation`은 설명 품질이 핵심이므로 `final_explanation`을 chosen artifact로 저장한다.

---

## 3. 생성 시점과 소유 계층

### 1) Proposal 생성 시점

- `parsed_ai_result`가 생성된다.
- 필요 시 `diff_patch_ref` 같은 proposal 원본 artifact가 저장된다.
- 이 단계의 artifact는 **AI가 처음 생성한 원본 산출물**이다.

### 2) Feedback 저장 시점

- 사용자의 `accepted`, `edited`, `rejected` 선택이 반영된다.
- `merge_patch_draft + edited`인 경우 최종 코드 본문을 별도 파일로 저장하고 `final_code_ref`를 만든다.
- 이 단계의 artifact는 **사용자 피드백이 반영된 최종 채택본**이다.

### 3) Training Candidate 생성 시점

- `training_candidate_id`를 먼저 확정한다.
- `prompt_ref`, `chosen_ref`, `rejected_ref`를 학습 후보 전용 경로에 저장한다.
- 이 단계의 artifact는 **모델 학습 또는 평가용으로 재구성된 참조본**이다.

---

## 4. 저장 원칙

### 1) Local File First

현재 MVP에서는 코드 본문, patch 원문, 긴 설명 원문, prompt 원문처럼 크기가 큰 artifact를 우선 로컬 파일 시스템에 저장한다.

이 원칙의 이유는 다음과 같다.

- 실제 코드/텍스트 본문은 SQLite보다 파일 시스템이 관리하기 자연스럽다.
- AI 원본 결과와 사용자 최종 채택본을 별도 artifact로 보관해야 한다.
- 학습 후보 수집 단계에서 파일 단위 재사용이 쉽다.

### 2) SQLite는 메타데이터 우선

SQLite에는 ref 문자열, 식별자, 상태, 시간, 관계 키 같은 메타데이터를 우선 저장한다.

즉, SQLite는 다음 역할을 가진다.

- artifact를 가리키는 ref 저장
- proposal / feedback / training candidate 간 관계 추적
- 조회, 정렬, 필터링

반면 실제 본문은 로컬 파일이 source of truth가 된다.

### 3) 목적별 ref 분리

동일한 결과를 가리키더라도 목적이 다르면 ref를 분리한다.

예시:

- proposal 원본 비교용 ref: `diff_patch_ref`
- 사용자 채택본 보존용 ref: `final_code_ref`
- 학습 후보용 chosen ref: `chosen_ref`

이 분리는 향후 재학습, 평가, 감사 추적 시 의미 혼동을 줄이기 위한 것이다.

---

## 5. 현재 수집 범위

현재 구현 기준으로 즉시 수집 가능한 범위는 다음과 같다.

### proposal 계층

- `diff_patch_ref`
- recommendation 결과 텍스트
- explanation 결과 텍스트

### feedback 계층

- `final_code_ref`
- `final_text`
- `final_explanation`
- `selection_status`
- `quality_tag`
- `feedback_note`

### training candidate 계층

- `prompt_ref`
- `chosen_ref`
- `rejected_ref`
- `dataset_type`
- `source_type`

즉, 현재 스프린트 기준으로는 **로컬 파일 기반 artifact + payload 메타데이터**까지 수집 가능하다.

---

## 6. 후속 SQLite 연계 범위

현재는 학습 후보 artifact를 로컬 파일 기준으로 먼저 저장한다. 후속 스프린트에서는 다음 링크를 SQLite와 더 명확히 연결할 수 있다.

- `training_candidate_id`와 artifact ref 간 연결 레코드
- `proposal_id` ↔ `feedback_id` ↔ `training_candidate_id` 추적
- artifact 해시, 파일 크기, 생성 시각 같은 감사용 메타데이터

### handoff 기준

다음 작업자가 이어받을 때의 기준은 다음과 같다.

- proposal 원본이 필요하면 `diff_patch_ref`를 기준으로 조회한다.
- 사용자 최종 채택본이 필요하면 `final_code_ref`를 기준으로 조회한다.
- 학습 후보 수집이 필요하면 `prompt_ref`, `chosen_ref`, `rejected_ref`를 기준으로 조회한다.
- SQLite는 관계형 조회와 링크 관리에 사용하고, 실제 본문 재수집은 로컬 artifact를 우선 사용한다.

---

## 7. 현재 비범위

아래 항목은 본 문서 기준 현재 MVP 범위 밖이다.

- `merge_mediation`의 training candidate 자동 생성
- 학습 후보 artifact의 원격 업로드 / 동기화
- chosen / rejected artifact의 공통 표준 JSON 스키마 고도화
- artifact 버전 관리 및 중복 제거 전략

---

## 8. 요약

- `diff_patch_ref`는 AI 원본 proposal artifact다.
- `final_code_ref`는 사용자 최종 채택 코드 artifact다.
- `prompt_ref`, `chosen_ref`, `rejected_ref`는 학습 후보 전용 artifact ref다.
- 현재 MVP는 로컬 파일 우선 저장 전략을 사용한다.
- 후속 SQLite 작업은 ref 메타데이터와 관계 링크를 강화하는 방향으로 이어진다.
