# Merge Dataset

병합 충돌 관련 synthetic dataset입니다.

포함 범위:

- `merge_patch_draft`
- `conflict_explanation`
- `merge_mediation`

구성 원칙:

- 기존 legacy `case_*` 케이스를 모두 `merge/` 아래로 이동해 recommendation 도메인과 구조를 맞춤
- 각 케이스는 기본적으로 `prompt.md + chosen.json`을 유지
- DPO용 학습 시에는 같은 폴더에 `rejected.json`을 추가로 둔다
- 케이스 이름은 기존 식별자(`case_A_*`, `case_B_*`, `case_C_*`)를 그대로 보존

예시 구조:

```text
synthetic_dataset/merge/
  ├── case_01_example/
  ├── case_A_01_type_contract_break/
  ├── case_B_01_feedback_ref_rule_conflict/
  └── case_C_12_multi_file_ui_feedback_flow/
```
