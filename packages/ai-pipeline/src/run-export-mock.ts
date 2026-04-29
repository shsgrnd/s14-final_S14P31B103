import { runExportMockValidation } from './__tests__/export.mock';

console.log("Starting Export Pipeline Mock...");
runExportMockValidation()
  .then(() => {
    console.log("Export Mock Finished Successfully");
  })
  .catch((err) => {
    console.error("Export Mock Failed:", err);
    process.exit(1);
  });
