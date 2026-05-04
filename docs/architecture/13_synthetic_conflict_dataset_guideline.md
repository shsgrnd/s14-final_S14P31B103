# 📚 임의 충돌 데이터셋(Synthetic Conflict Dataset) 포맷 가이드라인

이 문서는 AI 병합 초안 파이프라인(SFT/DPO) 학습 전, 초기 베이스라인 검증 및 모델 파인튜닝(미세조정)에 사용될 **임의 충돌 데이터셋의 구성 기준과 작업 방식**을 정의하는 공식 기준서입니다. 

---

## 1. 목적 및 원칙
- **목적:** SFT(지도학습) 훈련을 위한 노이즈 없는 고품질의 Ground Truth 데이터 확보.
- **원본 보존 및 1회용 추출 원칙:** SQLite DB에는 시스템 흐름 추적을 위한 메타데이터를 영구 보존하지만, AI 학습용 데이터에는 시스템 메타데이터(`session_id`, `proposal_id` 등)를 일절 포함하지 않습니다. 이는 모델이 무의미한 ID 문자열을 정답 패턴으로 착각하여 할루시네이션을 일으키는 것을 막기 위함입니다.

---

## 2. 작업 방식: "JSONL 수동 작성 금지" (작업 폴더 구조)

최종 학습 파일은 한 줄에 JSON 하나씩 들어가는 `.jsonl` 형식이지만, **사람이 직접 JSONL을 작성하면 이스케이프(`\n`, `\"`) 오류로 인해 100% 포맷이 깨집니다.**
따라서 팀원 A는 다음과 같은 폴더/파일 구조로만 데이터를 작성하십시오. `prompt.md`와 `chosen.json`을 먼저 모은 뒤, 마지막 단계에서 일괄 파싱하여 `.jsonl`로 변환합니다. (추후 팀원 B가 이를 파싱하여 jsonl로 병합하는 스크립트를 제공/실행합니다.)

```text
synthetic_dataset/
  ├── case_01_syntax_conflict/
  │     ├── prompt.md       # (입력값) 시스템 지시문 + 충돌 마커가 포함된 원본 코드
  │     └── chosen.json     # (정답값) 충돌이 해결된 결과물을 담은 JSON 파일
  ├── case_02_logic_conflict/
  │     ├── prompt.md
  │     └── chosen.json
  ...
```

---

## 3. 파일 작성 상세 가이드

### 3.1. `prompt.md` (입력 컨텍스트)
AI가 보고 풀어야 할 시험지입니다. **반드시 일관된 시스템 프롬프트와 함께 실제 Git 충돌 마커가 포함되어야 합니다.**

```markdown
<!-- prompt.md 예시 -->
당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 문맥에 맞게 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

<<<<<<< HEAD
const apiUrl = "https://api.v1.com";
=======
const apiUrl = "https://api.v2.com/graphql";
>>>>>>> feature/update-api
```

다중 파일 충돌 케이스를 작성할 때는 하나의 `prompt.md` 안에 파일 경로 구분자를 넣고, 파일별 충돌 블록을 순서대로 배치합니다.

```markdown
<!-- multi-file prompt.md 예시 -->
당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 문맥에 맞게 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

--- FILE: packages/shared-types/src/dto/ai.ts ---
export interface TrainingCandidatePayload {
  promptRef: string;
  chosenRef: string;
}

--- FILE: packages/ai-pipeline/src/feedback/training-candidate.ts ---
return { promptRef, chosenRef };
```

### 3.2. `chosen.json` (정답 스키마)
AI가 최종적으로 뱉어내야 할 정답지입니다. **단순한 소스 코드가 아니라, 파서(Parser)가 읽을 수 있는 완벽한 JSON 형식이어야 합니다.**
우리가 구현할 기능(Feature Type)에 따라 작성해야 하는 JSON Key가 다릅니다. 상황에 맞는 스키마를 선택해 작성하세요.

#### A. 병합 초안 생성 (merge_patch_draft) 케이스
가장 일반적인 "코드 병합" 상황일 때 작성합니다.
```json
{
  "title": "API 엔드포인트 v2 업데이트 병합",
  "summary": "충돌이 발생한 API URL을 v2 GraphQL 엔드포인트로 병합했습니다.",
  "explanation": "feature 브랜치의 v2 업데이트가 최신 규격이므로 이를 채택합니다.",
  "merged_code": "const apiUrl = \"https://api.v2.com/graphql\";",
  "validation_summary": "v2 엔드포인트 변경에 따른 다른 파일의 호출부 확인이 필요합니다."
}
```

`merged_code`가 다중 파일 결과를 담아야 할 때는 `prompt.md`와 동일하게 파일 경로 구분자를 포함해, 사람이 읽고 후속 스크립트가 분리할 수 있는 형태로 작성합니다.

#### B. 충돌 원인 분석 (conflict_explanation) 케이스
코드를 직접 병합하기보단, 왜 충돌이 났는지 설명하는 상황일 때 작성합니다.
```json
{
  "title": "API URL 버전 충돌",
  "summary": "HEAD는 v1, feature 브랜치는 v2를 가리키고 있습니다.",
  "cause_summary": "엔드포인트 버저닝 불일치",
  "detailed_explanation": "한 브랜치는 기존 REST API를 유지했고, 다른 브랜치는 GraphQL로 전환했습니다.",
  "related_files": ["src/api/config.ts"],
  "recommended_resolution_direction": "팀의 백엔드 전환 계획에 따라 v2 GraphQL을 채택하는 것을 권장합니다.",
  "risk_level": "medium"
}
```

#### C. 중재안 제공 (merge_mediation) 케이스
서로 아키텍처가 달라 A안, B안 등 선택지를 제공해야 할 때 작성합니다.
```json
{
  "title": "API 버전 병합 중재안",
  "summary": "v1 유지와 v2 전환 중 선택이 필요합니다.",
  "explanation": "두 브랜치가 완전히 다른 통신 방식을 채택했습니다.",
  "recommended_option": "Option 2: v2 GraphQL로 전면 전환",
  "tradeoffs": "v2 전환 시 클라이언트 코드 대거 수정 필요, 단 장기적으로 성능 향상.",
  "recommended_next_action": "백엔드 팀과 API 버전 호환성 논의"
}
```

---

## 4. 엣지 케이스 (Edge Cases) 권장 사항

실제 실무에서 발생하는 다양한 충돌 상황을 의도적으로 섞어서 폴더(`case_xx`)를 생성해 주세요.

1. **단순 구문 충돌:** 같은 줄에서 변수명이나 함수명만 다르게 변경된 경우.
2. **수직적 로직 충돌:** 한 브랜치에서는 함수를 호출했는데, 다른 브랜치에서는 그 함수 정의를 삭제한 경우.
3. **의존성 충돌:** `package.json`에서 서로 다른 버전의 라이브러리를 추가한 경우.
4. **포맷팅 충돌:** 로직은 같으나 Prettier 포맷팅(띄어쓰기, 줄바꿈) 차이로 충돌 마커가 생긴 경우. (정답은 팀 컨벤션에 맞는 코드로 작성)
5. **다중 파일 충돌:** 하나의 `prompt.md` 안에 여러 파일의 충돌 마커를 연달아 배치한 경우. 공통 타입, 호출부, 저장 로직처럼 서로 연결된 파일을 함께 제시해 문맥 판단 능력을 평가합니다.

권장 운영 방식:
- 팀 단위로 데이터를 나눌 때는 `conflict_axis`, `feature_type`, `domain`, `file_scope`를 함께 적어 중복을 줄입니다.
- `conflict_axis`는 공식 5축(`syntax`, `logic`, `dependency`, `formatting`, `multi-file`)을 기본으로 하되, 필요하면 `type-contract`, `validation-rule`처럼 더 구체적인 하위 라벨을 붙여도 됩니다.
- `feature_type`은 `merge_patch_draft`, `conflict_explanation`, `merge_mediation` 중 하나를 명시합니다.
- `file_scope`는 `single-file` 또는 `multi-file`로 표시해 커버리지를 추적합니다.

### 4.1. 3인 시작안: 총 36개

초기 smoke test용 10여 개 수준은 파이프라인 점검에는 유효하지만, 실제 SFT용 시작셋으로는 다양성이 부족합니다.  
따라서 **3명이 병렬로 바로 시작할 경우 총 36개(각 12개)**를 기본 시작안으로 권장합니다.

- 전체 분포 권장:
  - `merge_patch_draft`: 18개
  - `conflict_explanation`: 9개
  - `merge_mediation`: 9개
- 파일 범위 권장:
  - `single-file`: 24개
  - `multi-file`: 12개

케이스명은 예시이며, **이름이 그대로 코드 구조를 100% 설명하지 않아도 괜찮습니다.** 대신 각 케이스가 `feature_type`, `conflict_axis`, `domain`, `file_scope` 기준으로 다른 케이스와 명확히 구분되어야 합니다.

| 담당 | case_id | feature_type | conflict_axis | domain | file_scope | 한줄 설명 |
|---|---|---|---|---|---|---|
| 팀원 A | `A_01_type_contract_break` | `merge_patch_draft` | `type-contract` | `shared-types` | `single-file` | DTO/interface 필드 충돌 |
| 팀원 A | `A_02_deleted_helper_reference` | `merge_patch_draft` | `logic` | `ai-pipeline` | `single-file` | 삭제된 helper를 다른 브랜치가 호출 |
| 팀원 A | `A_03_parser_field_rename` | `conflict_explanation` | `syntax` | `ai-pipeline` | `single-file` | 필드명 변경 충돌 원인 설명 |
| 팀원 A | `A_04_multi_file_payload_sync` | `merge_patch_draft` | `multi-file` | `shared-types + ai-pipeline` | `multi-file` | 타입 정의와 호출부를 함께 병합 |
| 팀원 A | `A_05_schema_enum_drift` | `merge_mediation` | `type-contract` | `shared-types` | `single-file` | enum/스키마 해석 차이 중재 |
| 팀원 A | `A_06_validation_branch_split` | `merge_patch_draft` | `validation-rule` | `ai-pipeline` | `single-file` | 검증 분기 로직 충돌 |
| 팀원 A | `A_07_conflict_candidate_shape_change` | `conflict_explanation` | `logic` | `shared-types + ai-pipeline` | `single-file` | conflict candidate 구조 변경 설명 |
| 팀원 A | `A_08_multi_file_parser_output_sync` | `merge_mediation` | `multi-file` | `ai-pipeline + shared-types` | `multi-file` | parser 출력과 타입 동기화 중재 |
| 팀원 A | `A_09_optional_field_required_conflict` | `merge_patch_draft` | `type-contract` | `shared-types` | `single-file` | optional 필드가 required로 바뀜 |
| 팀원 A | `A_10_artifact_writer_call_removed` | `merge_patch_draft` | `logic` | `ai-pipeline` | `single-file` | artifact writer 호출 삭제 충돌 |
| 팀원 A | `A_11_result_status_explanation_gap` | `conflict_explanation` | `validation-rule` | `ai-pipeline` | `single-file` | 상태값 해석 불일치 설명 |
| 팀원 A | `A_12_multi_file_prompt_chosen_alignment` | `merge_patch_draft` | `multi-file` | `dataset-format` | `multi-file` | prompt/chosen 파일 정렬 규칙 충돌 |
| 팀원 B | `B_01_feedback_ref_rule_conflict` | `merge_mediation` | `validation-rule` | `storage` | `single-file` | `final_code_ref` 필수 여부 충돌 |
| 팀원 B | `B_02_export_field_policy_conflict` | `conflict_explanation` | `logic` | `ai-pipeline + export` | `single-file` | export 포함/제외 필드 기준 충돌 |
| 팀원 B | `B_03_dependency_version_split` | `merge_patch_draft` | `dependency` | `package-config` | `single-file` | `package.json` 버전 충돌 |
| 팀원 B | `B_04_multi_file_artifact_linkage` | `merge_mediation` | `multi-file` | `storage + ai-pipeline` | `multi-file` | artifact ref 저장 규칙과 materializer 충돌 |
| 팀원 B | `B_05_final_code_ref_missing_guard` | `merge_patch_draft` | `validation-rule` | `storage` | `single-file` | `final_code_ref` 누락 방어 로직 충돌 |
| 팀원 B | `B_06_repository_input_field_rename` | `merge_patch_draft` | `type-contract` | `storage + shared-types` | `single-file` | repository 입력 필드명 변경 |
| 팀원 B | `B_07_jsonl_export_escape_mismatch` | `conflict_explanation` | `formatting` | `export` | `single-file` | escape 처리 차이 설명 |
| 팀원 B | `B_08_multi_file_training_candidate_refs` | `merge_patch_draft` | `multi-file` | `storage + export` | `multi-file` | training candidate ref 동기화 충돌 |
| 팀원 B | `B_09_package_manager_lock_drift` | `merge_mediation` | `dependency` | `package-config` | `single-file` | lockfile과 package 기준 차이 중재 |
| 팀원 B | `B_10_rejected_ref_required_conflict` | `merge_patch_draft` | `validation-rule` | `ai-pipeline + storage` | `single-file` | `rejected_ref` 필수 조건 충돌 |
| 팀원 B | `B_11_dataset_type_explanation_conflict` | `conflict_explanation` | `syntax` | `shared-types + export` | `single-file` | dataset type 필드명 해석 설명 |
| 팀원 B | `B_12_multi_file_feedback_materializer_sync` | `merge_patch_draft` | `multi-file` | `storage + ai-pipeline` | `multi-file` | feedback materializer 연동 충돌 |
| 팀원 C | `C_01_message_contract_drift` | `merge_mediation` | `type-contract` | `extension + shared-types` | `single-file` | 메시지 payload shape 불일치 |
| 팀원 C | `C_02_async_retry_conflict` | `conflict_explanation` | `logic` | `ai-pipeline` | `single-file` | retry/timeout 흐름 충돌 설명 |
| 팀원 C | `C_03_formatting_only_conflict` | `merge_patch_draft` | `formatting` | `extension` | `single-file` | 포맷팅만 다른 충돌 |
| 팀원 C | `C_04_multi_file_message_router` | `merge_patch_draft` | `multi-file` | `extension + ai-pipeline` | `multi-file` | router와 handler 파일 동시 충돌 |
| 팀원 C | `C_05_webview_payload_optional_gap` | `merge_patch_draft` | `type-contract` | `extension` | `single-file` | webview payload optional 필드 충돌 |
| 팀원 C | `C_06_timeout_fallback_removed` | `merge_mediation` | `logic` | `ai-pipeline` | `single-file` | timeout fallback 삭제 여부 중재 |
| 팀원 C | `C_07_import_export_name_mismatch` | `conflict_explanation` | `syntax` | `extension + shared-types` | `single-file` | import/export 이름 불일치 설명 |
| 팀원 C | `C_08_multi_file_command_service_contract` | `merge_patch_draft` | `multi-file` | `extension + storage` | `multi-file` | command와 service 계약 동시 충돌 |
| 팀원 C | `C_09_eslint_prettier_rule_split` | `merge_patch_draft` | `formatting` | `package-config` | `single-file` | ESLint/Prettier 규칙 분기 |
| 팀원 C | `C_10_retry_policy_option_rename` | `merge_patch_draft` | `type-contract` | `ai-pipeline` | `single-file` | retry 옵션 필드명 변경 |
| 팀원 C | `C_11_user_action_resolution_gap` | `conflict_explanation` | `logic` | `extension + ai-pipeline` | `single-file` | 사용자 액션 해석 차이 설명 |
| 팀원 C | `C_12_multi_file_ui_feedback_flow` | `merge_mediation` | `multi-file` | `extension + ai-pipeline` | `multi-file` | UI feedback flow 다중 파일 중재 |

### 4.2. 체크리스트 예시

- [ ] 팀원 A: `A_01_type_contract_break`
- [ ] 팀원 A: `A_02_deleted_helper_reference`
- [ ] 팀원 A: `A_03_parser_field_rename`
- [ ] 팀원 A: `A_04_multi_file_payload_sync`
- [ ] 팀원 A: `A_05_schema_enum_drift`
- [ ] 팀원 A: `A_06_validation_branch_split`
- [ ] 팀원 A: `A_07_conflict_candidate_shape_change`
- [ ] 팀원 A: `A_08_multi_file_parser_output_sync`
- [ ] 팀원 A: `A_09_optional_field_required_conflict`
- [ ] 팀원 A: `A_10_artifact_writer_call_removed`
- [ ] 팀원 A: `A_11_result_status_explanation_gap`
- [ ] 팀원 A: `A_12_multi_file_prompt_chosen_alignment`
- [ ] 팀원 B: `B_01_feedback_ref_rule_conflict`
- [ ] 팀원 B: `B_02_export_field_policy_conflict`
- [ ] 팀원 B: `B_03_dependency_version_split`
- [ ] 팀원 B: `B_04_multi_file_artifact_linkage`
- [ ] 팀원 B: `B_05_final_code_ref_missing_guard`
- [ ] 팀원 B: `B_06_repository_input_field_rename`
- [ ] 팀원 B: `B_07_jsonl_export_escape_mismatch`
- [ ] 팀원 B: `B_08_multi_file_training_candidate_refs`
- [ ] 팀원 B: `B_09_package_manager_lock_drift`
- [ ] 팀원 B: `B_10_rejected_ref_required_conflict`
- [ ] 팀원 B: `B_11_dataset_type_explanation_conflict`
- [ ] 팀원 B: `B_12_multi_file_feedback_materializer_sync`
- [x] 팀원 C: `C_01_message_contract_drift`
- [x] 팀원 C: `C_02_async_retry_conflict`
- [x] 팀원 C: `C_03_formatting_only_conflict`
- [x] 팀원 C: `C_04_multi_file_message_router`
- [x] 팀원 C: `C_05_webview_payload_optional_gap`
- [x] 팀원 C: `C_06_timeout_fallback_removed`
- [x] 팀원 C: `C_07_import_export_name_mismatch`
- [x] 팀원 C: `C_08_multi_file_command_service_contract`
- [x] 팀원 C: `C_09_eslint_prettier_rule_split`
- [x] 팀원 C: `C_10_retry_policy_option_rename`
- [x] 팀원 C: `C_11_user_action_resolution_gap`
- [x] 팀원 C: `C_12_multi_file_ui_feedback_flow`
