당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 여러 파일에서 발생한 데이터 불일치 충돌을 분석하고, 시스템 안정성을 위한 중재안(Mediation)을 제시해 주세요.

```typescript
// packages/shared-types/src/dto/parser.ts
<<<<<<< HEAD
export interface ParseResult {
  content: string;
  isError: boolean;
}
=======
export interface ParseResult {
  output: {
    text: string;
    tokens: number;
  };
  success: boolean;
}
>>>>>>> feat/ai/parser-v3-types

// packages/ai-pipeline/src/parsers/BaseParser.ts
<<<<<<< HEAD
const handleResult = (res: ParseResult) => {
  if (res.isError) return null;
  return res.content;
};
=======
const handleResult = (res: ParseResult) => {
  if (!res.success) throw new Error("Parsing failed");
  return res.output.text;
};
>>>>>>> feat/ai/parser-v3-logic
```
