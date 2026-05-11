# Synthetic Dataset

GitCat 학습/평가용 원본 케이스 자산입니다.

현재 구조:

```text
synthetic_dataset/
  ├── merge/
  └── recommendation/
```

도메인 구분:

- `merge/`: 병합 충돌 분석, 병합 초안, 충돌 설명, 중재안 관련 케이스
- `recommendation/`: 브랜치명, 커밋 메시지, PR 설명 추천 관련 케이스

공통 규칙:

- 기본 학습 원본은 `prompt.md + chosen.json` 조합으로 유지
- DPO용 확장 시 각 케이스에 `rejected.json`을 함께 둔다
- 원본 케이스는 여기 두고, JSONL 생성은 `packages/ai-pipeline/trainer/build_jsonl.py`에서 수행
- DPO JSONL 생성은 `packages/ai-pipeline/trainer/build_dpo_jsonl.py`에서 수행
- 다중 depth 구조를 허용하되 케이스 폴더 단위로 식별 가능해야 함
