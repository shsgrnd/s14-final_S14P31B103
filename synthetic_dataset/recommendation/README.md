# Recommendation Dataset

추천 전용 synthetic dataset입니다.

구성 원칙:

- 총 30개 케이스
- `5대 필수 시나리오 x 3 recommendation type x 2 variation`
- recommendation type:
  - `branch_name`
  - `commit_message`
  - `pr_description`

시나리오 축:

- `standard`
- `messy_commits`
- `large_refactor`
- `hotfix`
- `dependency`

디렉토리 규칙:

```text
synthetic_dataset/recommendation/
  ├── branch_name/
  ├── commit_message/
  └── pr_description/
```

케이스 규칙:

- 각 케이스는 기본적으로 `prompt.md + chosen.json`으로 구성
- DPO용 추천 학습 시에는 같은 폴더에 `rejected.json`을 추가로 둔다
- `chosen.json`은 recommendation 최소 응답 스키마를 기준으로 작성
- `recommendation_type`은 baseline 집계 편의를 위해 명시 포함
- `pr_description`의 `primary_text`는 현재 구조상 PR 제목과 본문을 하나의 markdown 문자열로 함께 담음
