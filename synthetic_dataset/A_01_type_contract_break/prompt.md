당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 DTO 인터페이스 코드를 분석하고, 최신 규격에 맞게 병합한 결과를 JSON 형식으로 반환해 주세요.

```typescript
// packages/shared-types/src/dto/git.ts
export interface GitMergeResult {
<<<<<<< HEAD
  conflictFiles: string[];
  isSuccess: boolean;
  errorMessage?: string;
=======
  conflicts: string[];
  status: "success" | "failure" | "conflict";
  latencyMs: number;
>>>>>>> feat/ai/standardize-merge-result
}
```
