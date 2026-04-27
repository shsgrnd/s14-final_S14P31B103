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
