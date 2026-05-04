당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 타입 정의 충돌을 분석하고, 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

```typescript
// packages/shared-types/src/dto/artifact.ts
export interface ArtifactMetadata {
<<<<<<< HEAD
  author?: string;
  version: string;
=======
  author: string;
  version: number;
>>>>>>> feature/strict-artifact-meta
}
```
