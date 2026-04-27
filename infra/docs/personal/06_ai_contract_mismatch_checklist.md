# AI 계약 불일치 체크리스트 (2026-04-27)

이 문서는 신형섭 담당 범위에서 `AI 문서`, `shared-types`, `SQLite 스키마` 사이의 불일치 후보를 빠르게 파악하기 위한 체크리스트다.  
목표는 새 설계를 발명하는 것이 아니라, 이미 문서에 적힌 규칙이 코드 계약에 어디까지 반영되었는지 확인하고 팀 협업 전에 정리 포인트를 남기는 것이다.

---

## 1. 비교 기준

- `docs/api/ai/AI_work_breakdown.md`
- `packages/shared-types/src/dto/ai.ts`
- `packages/shared-types/src/enums/ai.ts`
- `packages/storage/src/sqlite/migrations/schema.ts`

---

## 2. 핵심 불일치 요약

### A. `parsed_ai_result` 공통 스키마 부재 문제는 해소됨

- 문서:
  - `parsed_ai_result`를 공통 결과 객체로 정의하고 있다.
  - `proposal_id`, `session_id`, `ai_request_id`, `feature_type`, `title`, `summary`, `proposal_status`, `parser_version` 등을 필수로 둔다.
- 코드:
  - `packages/shared-types/src/schemas/ai.ts`에 `ParsedAiResultSchema`가 있다.
  - `dto/ai.ts`에도 `ParsedAiResult` union 타입이 정리되어 있다.

현재 상태:
- 공통 결과 스키마 자체는 정리되었다.
- 이후 체크 포인트는 "문서 필드가 모두 반영되었는지"와 "feature별 세부 필드 누락이 없는지"이다.

---

### B. `proposal_status` enum은 부분 해소됐지만 아직 완전히 같지는 않다

- 문서 기준:
  - `generated`
  - `parsed`
  - `displayed`
  - `accepted`
  - `edited`
  - `rejected`
- 코드 `MergeProposalStatusEnum`:
  - `generated`
  - `parsed`
  - `displayed`
  - `accepted`
  - `edited`
  - `rejected`
  - `completed`
  - `failed`

불일치 포인트:
- 이전에 없던 `parsed`, `edited`, `rejected`는 코드에 반영되었다.
- 다만 문서 `proposal_status`에는 `completed`, `failed`가 직접 나오지 않는다.
- 반대로 문서/CSV에는 `archived`가 있는데 현재 코드 enum에는 없다.

정리 필요:
- `completed`, `failed`, `archived`를 어떤 레벨 상태로 볼지 추가 합의 필요
- 지금 구현은 AI 파이프라인 내부 lifecycle 편의를 위해 `completed`, `failed`를 사용 중이다.

---

### C. `ProposalFeedback` 타입 차이는 대부분 줄었지만 호환 필드는 남아 있다

- 문서 `proposal_feedback_payload`:
  - `feedback_id`
  - `proposal_id`
  - `selection_status`
  - `decided_at`
  - `final_text`
  - `final_code_ref`
  - `final_explanation`
  - `quality_tag`
  - `feedback_note`
- 코드 `ProposalFeedbackSchema`:
  - `feedback_id`
  - `proposal_id`
  - `merge_proposal_id`
  - `session_id`
  - `selection_status`
  - `final_text`
  - `final_code_ref`
  - `final_explanation`
  - `input_summary`
  - `response_ref`
  - `feedback_note`
  - `quality_tag`
  - `decided_at`

불일치 포인트:
- 문서 핵심 필드(`proposal_id`, `final_text`, `final_code_ref`, `final_explanation`)는 코드에 반영되었다.
- `merge_proposal_id`, `session_id`, `input_summary`, `response_ref`는 호환/확장용 필드로 남아 있다.

정리 필요:
- 장기적으로는 문서 payload와 저장/확장용 필드를 더 명확히 분리할지 검토 필요
- 현재는 신형섭 범위에서 feedback 생성기와 저장 입력 변환기로 실사용 흐름까지 연결된 상태다.

---

### D. `MergeProposal` 타입이 문서의 결과 구조와 직접 대응되지 않는다

- 문서 `parsed_ai_result`는 화면 전달용 결과 구조다.
- 코드 `MergeProposalSchema`는 저장 엔티티에 더 가깝다.

문서 필드 중 코드에 직접 없는 것:
- `proposal_id`라는 이름 자체
- `session_id`
- `summary`
- `parser_version`
- `diff_patch_ref`
- `merged_code_ref`
- 설명형 결과 전용 필드 (`cause_summary`, `detailed_explanation`, `recommended_resolution_direction`)

코드 필드 중 문서와 다른 것:
- `candidate_id`
- `ai_request_id`
- `proposed_code`
- `status`

정리 필요:
- 화면 전달 DTO와 저장 엔티티를 구분할지
- `MergeProposalSchema`가 저장 전용인지 화면 전송용인지 역할 분리 필요

---

### E. `conflict_candidates`의 필드명이 문서와 코드가 다르다

- 문서:
  - `conflict_candidate_id`
  - `file_path`
  - `line_start`
  - `line_end`
  - `conflict_type`
  - `reason_summary`
  - `risk_level`
- 코드 `ConflictCandidateSchema`:
  - `candidate_id`
  - `analysis_id`
  - `file_path`
  - `line_start`
  - `line_end`
  - `source_code`
  - `target_code`
  - `base_code`
  - `conflict_type`
  - `reason_summary`
  - `risk_level`
  - `detected_by`

불일치 포인트:
- 문서 최소 필드와 코드 필수 필드가 다르다.
- 코드에는 `source_code`, `target_code`, `detected_by`가 사실상 필수다.
- 문서는 `analysis_id` 개념보다 `conflict_candidate_id` 명명에 맞춰져 있다.

정리 필요:
- ai_input_payload용 최소 객체와 내부 저장/분석용 상세 객체를 분리할지 검토 필요

---

### F. `MergeProposalInputSchema`가 문서 ai_input_payload와 완전히 같지 않다

- 문서 `ai_input_payload`는 `conflict_candidates` 내부에 최소 필드만 요구한다.
- 코드 `MergeProposalInputSchema`는 `ConflictCandidateSchema`를 그대로 사용한다.

영향:
- 입력 수집 담당이 문서 기준 mock을 만들면 코드 검증에서 실패할 수 있다.
- 반대로 코드 기준으로 맞추면 문서보다 더 많은 필드를 강제하게 된다.

정리 필요:
- input payload용 `ConflictCandidateInputSchema`를 별도로 둘지 검토

---

### G. `RecommendationHistory` 타입과 SQLite 스키마 참조 키가 다르다

- 코드 `RecommendationHistorySchema`:
  - `ai_request_id`
- SQLite `RecommendationHistory` 테이블:
  - `inference_run_id`

불일치 포인트:
- shared-types는 `ai_request_id` 기준
- 실제 스키마는 `inference_run_id` 기준

정리 필요:
- 추천 결과 저장의 기준 식별자를 `ai_request_id`로 둘지 `inference_run_id`로 둘지 통일 필요

---

### H. `InferenceRun` 타입이 스키마 필드를 다 반영하지 않는다

- SQLite `InferenceRun`:
  - `tokens_used`
  - `latency_ms`
  - `response_ref`
- shared-types `InferenceRunSchema`:
  - `response_ref`는 있음
  - `tokens_used`, `latency_ms`는 없음

정리 필요:
- 통계/추적용 필드를 shared-types에 넣을지
- 저장 전용 필드로만 둘지 결정 필요

---

## 3. 오늘 기준 우선순위

### 우선순위 높음
- `proposal_status` enum 불일치
- `RecommendationHistory` 참조 키 차이

### 우선순위 중간
- recommendation 결과의 `format_notes`, `warnings` 반영 여부
- `MergeProposal` 화면 DTO vs 저장 엔티티 역할 혼재
- `ConflictCandidate` 입력용/저장용 필드 혼재
- `InferenceRun` 통계 필드 누락

---

## 4. 신형섭 담당 관점 결론

- 오늘 할 일은 이 불일치를 전부 코드로 고치는 것이 아니다.
- 다만 오늘 기준으로 `parsed_ai_result`, `proposal_feedback_payload`, recommendation mock/feedback 흐름은 신형섭 범위 안에서 상당 부분 코드 반영이 진행되었다.
- 우선 문서 기준 계약과 현재 코드 상태의 차이를 명확히 남겨, Core 담당과 AI 담당 사이의 경계 혼선을 줄이는 것이 목적이다.
- 다음 단계에서는 이 문서를 기준으로
  - mock 데이터 작성
  - 메시지 payload shape 정리
  - Core 담당 협업 포인트 분리
  순서로 이어가면 된다.
