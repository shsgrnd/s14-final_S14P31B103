# Chunking Report: run-mock.ts

- Total Chunks: 1
- Avg Tokens: 83

### Chunk 1 (83 tokens) 
```text
[Source: run-mock.ts]
import { runMockAiPipelineDemo } from './__tests__/ai.mock';

console.log("Starting Mock Pipeline Demo...");
runMockAiPipelineDemo()
  .then(() => {
    console.log("Mock Pipeline Demo Finished Successfully");
  })
  .catch((err) => {
    console.error("Mock Pipeline Demo Failed:", err);
    process.exit(1);
  });
```

