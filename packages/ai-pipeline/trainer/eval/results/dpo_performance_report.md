# 📊 Model Performance Comparison Report

본 리포트는 `llm-baseline` 과 `dpo` 결과를 공통 `case_id` 기준으로 비교한 결과입니다.

- Baseline file: `packages/ai-pipeline/trainer/eval/results/llm_baseline_results_20260508_095241.jsonl`
- Candidate file: `packages/ai-pipeline/trainer/eval/results/dpo_model_results.jsonl`
- Overlapped cases: `67`

## 1. 정량 지표 요약

| Metric | Baseline | Candidate | Diff |
| :--- | :---: | :---: | :---: |
| Similarity to chosen | 17.14% | 7.57% | -9.58% |
| JSON parse success | 97.01% | 0.00% | -97.01% |
| Exact JSON match | 0.00% | 0.00% | +0.00% |
| Avg. response length | 501.1자 | 1068.3자 | +567.2자 |

## 2. 샘플 케이스 비교

| Case ID | Baseline Similarity | Candidate Similarity | Diff |
| :--- | :---: | :---: | :---: |
| case_01_example | 37.1% | 8.3% | -28.8% |
| case_A_01_type_contract_break | 23.1% | 11.7% | -11.4% |
| case_A_02_deleted_helper_reference | 28.7% | 7.4% | -21.3% |
| case_A_03_parser_field_rename | 1.8% | 2.4% | +0.6% |
| case_A_04_multi_file_payload_sync | 59.8% | 0.0% | -59.8% |

## 3. 해석 가이드

- Similarity는 `chosen` 기준의 문자열 유사도라, 의미는 맞지만 표현이 다른 응답에는 보수적으로 나올 수 있습니다.
- JSON parse success와 exact match는 구조 안정성을 보는 용도입니다.
- LLM judge score는 해당 파일에 `llm_judge_scores`가 있을 때만 집계됩니다.
