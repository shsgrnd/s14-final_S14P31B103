당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 데이터셋 작성 규칙 충돌을 분석하고, 일관된 포맷팅 규칙을 적용하여 병합한 결과를 JSON 형식으로 반환해 주세요.

```markdown
// synthetic_dataset/A_12_multi_file_prompt_chosen_alignment/prompt.md
<<<<<<< HEAD
# 지시문
여기에 AI 지시문을 작성하세요.
=======
---
# AI Instruction
Write instructions here in English.
>>>>>>> feature/dataset-standard-v2

// synthetic_dataset/A_12_multi_file_prompt_chosen_alignment/chosen.json
<<<<<<< HEAD
{
  "title": "한글 제목",
  "summary": "한글 요약"
}
=======
{
  "title": "English Title",
  "summary": "English Summary"
}
>>>>>>> feature/dataset-standard-v2
```
