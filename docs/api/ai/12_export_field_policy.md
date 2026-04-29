# AI 결과 Export 포함/제외 필드 기준 (SFT/DPO)

이 문서는 `training_candidate_payload`에 저장된 AI 결과 artifact를 SFT/DPO 학습용 `.jsonl` 포맷으로 export할 때, 어떤 필드를 학습 타깃에 포함하고 어떤 필드를 제외할지 팀 공용 기준을 고정합니다.

관련 문서:
- `AI_work_breakdown.md` — AI 파트 인터페이스 계약
- `11_ai_payload_schema.csv` — parsed_ai_result 전체 스키마
- `infra/docs/personal/11_ai_artifact_ref_storage_strategy.md` — ref 저장 전략

---

## 1. 기본 원칙

- LLM은 최소 응답만 반환하고, `proposal_id`, `session_id`, `parser_version` 등 시스템 메타데이터는 후처리에서 주입한다.
- 따라서 export 시 학습 타깃에는 **모델 출력 본문**만 남기고, 시스템이 부여하는 식별자·상태 필드는 모두 제외한다.
- `*_ref` 필드는 실제 본문 파일의 포인터이므로, export 시에는 ref를 따라 **실제 본문 내용**을 읽어 인라인으로 펼쳐야 한다.

> **멀티턴 분석 관련**
> DB와 로컬 원본 파일(`chosen.json`, `rejected.json`)에는 통계 및 추적을 위해 `session_id`가 영구히 보존됩니다. 하지만 이 값을 GPU 학습용 SFT/DPO 정답지(Output)에 그대로 포함하면 AI가 랜덤 ID 문자열을 생성하도록 잘못 학습(할루시네이션)하게 됩니다.
> 향후 **멀티턴 문맥 학습**이 필요해질 경우, 단일 `session_id` 텍스트를 남기는 것이 아니라 새로운 Export 스크립트를 작성하여 이전 이력 전체를 묶어 **Prompt 내부에 자연어로 주입(Contextualize)**하는 방식을 사용해야 합니다.

---

## 2. 공통 제외 필드 (모든 feature_type 공통)

| 필드 | 제외 이유 |
|---|---|
| `proposal_id` | 시스템 식별자, 학습 신호 없음 |
| `session_id` | 시스템 식별자, 학습 신호 없음 |
| `ai_request_id` | 시스템 식별자, 학습 신호 없음 |
| `proposal_status` | 상태 머신 값, 모델이 배울 필요 없음 |
| `parser_version` | 파싱 시스템 버전, 모델 출력 아님 |
| `confidence_score` | 파싱 후처리에서 주입, 모델 직접 출력 아님 |

---

## 3. feature_type별 포함 필드

### merge_patch_draft

모델이 배워야 할 것: 충돌 입력 → 병합 초안(패치/코드) 생성 능력

| 필드 | 포함 여부 | 비고 |
|---|:---:|---|
| `title` | ✅ | 병합 초안 제목 |
| `summary` | ✅ | 병합 초안 요약 |
| `explanation` | ✅ | 판단 근거 설명 |
| `diff_patch_ref` | ✅ (본문 펼쳐서) | ref → 실제 patch 내용으로 변환 |
| `merged_code_ref` | ✅ (본문 펼쳐서) | ref → 실제 코드 내용으로 변환 |
| `applied_files` | ✅ | 적용 대상 파일 목록 |
| `validation_required` | ❌ | 정적 분석 메타, 모델 출력 아님 |
| `validation_summary` | ✅ | 검증 주의사항, 모델 생성 내용 |

**SFT 최소 세트**: `title`, `summary`, `explanation`, `diff_patch_ref` 본문  
**DPO 추가 세트**: `chosen_ref` 본문(채택본) + `rejected_ref` 본문(비채택본)

---

### conflict_explanation

모델이 배워야 할 것: 충돌 후보 입력 → 원인 설명 및 해결 방향 생성 능력

| 필드 | 포함 여부 | 비고 |
|---|:---:|---|
| `title` | ✅ | 충돌 설명 제목 |
| `summary` | ✅ | 충돌 설명 요약 |
| `explanation` | ✅ | 부연 설명 |
| `cause_summary` | ✅ | 충돌 원인 핵심 요약 |
| `detailed_explanation` | ✅ | 상세 충돌 원인 설명 |
| `related_files` | ✅ | 관련 파일 목록 |
| `recommended_resolution_direction` | ✅ | 권장 해결 방향 |
| `risk_level` | ✅ | 위험도 판단, 모델 생성 내용 |

**SFT 최소 세트**: `title`, `summary`, `cause_summary`, `recommended_resolution_direction`  
**DPO 추가 세트**: `chosen_ref` 본문 + `rejected_ref` 본문

---

### merge_mediation

모델이 배워야 할 것: 충돌 입력 → 중재안(선택지 + 트레이드오프) 생성 능력

| 필드 | 포함 여부 | 비고 |
|---|:---:|---|
| `title` | ✅ | 중재안 제목 |
| `summary` | ✅ | 중재안 요약 |
| `explanation` | ✅ | 부연 설명 |
| `recommended_option` | ✅ | 권장 선택지 |
| `tradeoffs` | ✅ | 각 선택지 장단점 |
| `recommended_next_action` | ✅ | 다음 행동 권장 |

**SFT 최소 세트**: `title`, `summary`, `recommended_option`, `recommended_next_action`  
**DPO 추가 세트**: `chosen_ref` 본문 + `rejected_ref` 본문

---

### recommendation

모델이 배워야 할 것: 변경 컨텍스트 입력 → 커밋/브랜치명/작업 설명 추천 능력

| 필드 | 포함 여부 | 비고 |
|---|:---:|---|
| `title` | ✅ | 추천 결과 제목 |
| `summary` | ✅ | 추천 결과 요약 |
| `explanation` | ✅ | 판단 근거 |
| `primary_text` | ✅ | 1순위 추천 텍스트 |
| `alternative_texts` | ✅ | 대안 추천 목록 |
| `generation_basis_summary` | ✅ | 추천 생성 근거 요약 |
| `format_notes` | ✅ | 형식 관련 참고사항 |
| `warnings` | ✅ | 추천 사용 시 주의사항 |
| `recommendation_type` | ❌ | 분기 식별자, 라우팅 목적 |

**SFT 최소 세트**: `title`, `summary`, `primary_text`, `alternative_texts`  
**DPO 추가 세트**: `chosen_ref` 본문(채택 텍스트) + `rejected_ref` 본문(비채택 텍스트)

---

## 4. Export 중간 포맷 구조

### SFT 포맷
```jsonl
{ "prompt": "<prompt_ref 본문>", "chosen": "<chosen_ref 본문>" }
```

### DPO 포맷
```jsonl
{ "prompt": "<prompt_ref 본문>", "chosen": "<chosen_ref 본문>", "rejected": "<rejected_ref 본문>" }
```

> `*_ref` 필드는 export 스크립트가 실제 로컬 파일을 읽어 본문으로 대체한다.
> 이 포맷은 모델 종속 학습 스크립트가 아닌 중간 포맷이며, 이후 각 프레임워크 포맷으로 변환한다.

---

## 5. 담당 범위

- **export 스크립트 구현**: 신형섭 (AI Infra 담당)
- **이 문서 기준으로 구현하는 Task**: Task 26 (SFT/DPO export 파이프라인 초안)
