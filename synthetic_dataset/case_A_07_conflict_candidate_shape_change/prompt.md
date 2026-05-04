당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌 후보 데이터 구조 변경 사항을 분석하고, 왜 충돌이 발생했는지와 향후 해결 방향을 설명하는 보고서를 JSON 형식으로 반환해 주세요.

```typescript
// packages/shared-types/src/dto/candidate.ts
<<<<<<< HEAD
export interface ConflictCandidate {
  id: string;
  lines: string[];
  priority: number;
}
=======
export interface ConflictCandidate {
  candidateId: string;
  blocks: Array<{
    content: string;
    type: "head" | "incoming";
  }>;
  score: number;
}
>>>>>>> feat/ai/candidate-v2
```
