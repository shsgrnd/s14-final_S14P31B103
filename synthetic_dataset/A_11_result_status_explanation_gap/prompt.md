당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 상태 코드 처리 충돌을 분석하고, 왜 충돌이 발생했는지와 향후 해결 방향을 설명하는 보고서를 JSON 형식으로 반환해 주세요.

```typescript
// packages/ai-pipeline/src/core/StatusMapper.ts
<<<<<<< HEAD
const mapStatus = (code: number) => {
  if (code === 0) return "SUCCESS";
  if (code === 1) return "PARTIAL_SUCCESS";
  return "ERROR";
};
=======
const mapStatus = (code: number) => {
  if (code === 200) return "success";
  if (code === 206) return "partial";
  return "failure";
};
>>>>>>> feat/ai/http-status-alignment
```
