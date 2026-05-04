당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 검증 로직 충돌을 분석하고, 두 브랜치의 검증 조건을 모두 만족하도록 병합한 결과를 JSON 형식으로 반환해 주세요.

```typescript
// packages/ai-pipeline/src/core/Validator.ts
const validateConfig = (config: any) => {
<<<<<<< HEAD
  if (!config.url) throw new Error("URL is required");
  if (config.retries < 0) config.retries = 0;
=======
  if (!config.url || !config.url.startsWith("http")) {
    throw new Error("Invalid URL format");
  }
  if (config.retries > 10) throw new Error("Max retries exceeded");
>>>>>>> feature/strict-validation
};
```
