당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 로직을 분석하고, 아키텍처 변경에 맞춰 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

```typescript
// packages/ai-pipeline/src/core/Manager.ts
const saveResults = async (results: any) => {
<<<<<<< HEAD
  await this.dbWriter.save(results);
  await this.artifactWriter.write(results);
=======
  // artifactWriter는 이제 내부 스케줄러에서 자동 처리됨
  await this.dbWriter.save(results);
>>>>>>> develop

export const handleFinalize = async (data: any) => {
<<<<<<< HEAD
  return await saveResults(data);
=======
  const result = await saveResults(data);
  notifyUser(result);
  return result;
>>>>>>> feature/add-notification
```
