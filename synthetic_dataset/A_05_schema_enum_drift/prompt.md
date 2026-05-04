당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 Enum 정의 충돌을 분석하고, 프로젝트의 일관성을 유지하기 위한 최적의 중재안(Mediation)을 제시해 주세요.

```typescript
// packages/shared-types/src/constants/status.ts
<<<<<<< HEAD
export enum MergeStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED"
}
=======
export enum MergeStatus {
  IDLE = "idle",
  RUNNING = "running",
  DONE = "done",
  ERROR = "error"
}
>>>>>>> feat/standardize-naming-convention
```
