당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 왜 충돌이 발생했는지와 향후 해결 방향을 설명하는 보고서를 JSON 형식으로 반환해 주세요.

```typescript
// packages/ai-pipeline/src/parsers/JsonParser.ts
<<<<<<< HEAD
const result = {
  raw_code: data.content,
  meta_info: data.extra
};
=======
const result = {
  sourceCode: data.content,
  metadata: data.extra,
  parsedAt: new Date()
};
>>>>>>> feat/ai/rename-parser-fields
```
