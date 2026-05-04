# Eval Notes

이 디렉토리는 `synthetic_dataset/`을 기반으로 실행한 평가 결과를 기록하는 공간입니다.

권장 용도:

- 현행 LLM baseline 평가 메모
- 오픈소스 모델 SFT/DPO 후 비교 평가 메모
- 케이스별 성공/실패 요약
- 필요 시 raw 결과 파일(`*.jsonl`) 보관

권장 파일 예시:

```text
llm_baseline_2026-05-04.md
llm_baseline_results.jsonl
opensource_sft_eval_2026-05-10.md
```

원칙:

- `synthetic_dataset/`는 원본 케이스 자산
- `packages/ai-pipeline/trainer/eval/`는 평가 결과 및 실험 기록

