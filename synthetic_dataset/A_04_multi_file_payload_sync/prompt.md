당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 여러 파일에서 발생한 충돌을 분석하고, 타입 정의와 실제 호출부가 일치하도록 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

```typescript
// packages/shared-types/src/dto/payload.ts
export interface PipelinePayload {
<<<<<<< HEAD
  id: string;
  data: any;
=======
  id: number;
  data: string;
  timestamp: number;
>>>>>>> feature/strong-typing
}

// packages/ai-pipeline/src/core/Processor.ts
const processPayload = (payload: PipelinePayload) => {
<<<<<<< HEAD
  console.log(`Processing payload: ${payload.id}`);
  return payload.data;
=======
  console.log(`Processing payload #${payload.id.toFixed(0)}`);
  return JSON.parse(payload.data);
>>>>>>> feature/strong-typing
};
```
