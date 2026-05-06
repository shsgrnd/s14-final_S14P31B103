# Chunking Report: run-live.ts

- Total Chunks: 6
- Avg Tokens: 133

### Chunk 1 (135 tokens) 
```text
[Source: run-live.ts]
import { AiInputPayloadSchema } from '@gitcat/shared-types';
import { resolveProposalArtifactPath } from '@gitcat/storage/file-storage/io';
import path from 'path';
import { loadRootEnv } from './config/load-root-env';
import { liveDemoScenarios, listLiveDemoScenarioNames } from './demo/live-inputs';
import { MergeAiService } from './merge-proposal/MergeAiService';
import { AiClient } from './provider/AiClient';

function printUsage(): void {
  console.log('Usage: pnpm --filter @gitcat/ai-pipeline run test:live -- <scenario>');
```

### Chunk 2 (157 tokens) 
```text
[Source: run-live.ts]
ge(): void {
  console.log('Usage: pnpm --filter @gitcat/ai-pipeline run test:live -- <scenario>');
  console.log(`Available scenarios: ${listLiveDemoScenarioNames().join(', ')}`);
  console.log('Env vars: GMS_KEY, GMS_BASE_URL, GMS_MODEL (optional)');
  console.log('Root .env is loaded automatically when present.');
}

async function main(): Promise<void> {
  loadRootEnv();
  const workspaceRoot = path.resolve(__dirname, '../../..');

  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const scenarioName = args[0];

  if (!scenarioName || scenarioName === '--help') {
```

### Chunk 3 (157 tokens) 
```text
[Source: run-live.ts]
arg !== '--');
  const scenarioName = args[0];

  if (!scenarioName || scenarioName === '--help') {
    printUsage();
    process.exit(scenarioName ? 0 : 1);
  }

  const payload = liveDemoScenarios[scenarioName];
  if (!payload) {
    console.error(`[GitCat AI] Unknown scenario: ${scenarioName}`);
    printUsage();
    process.exit(1);
  }

  AiInputPayloadSchema.parse(payload);

  const service = new MergeAiService(
    new AiClient({
      mode: 'live',
      model: process.env.GMS_MODEL,
    }),
  );

  console.log(`[GitCat AI] Running live scenario: ${scenarioName}`);
```

### Chunk 4 (149 tokens) 
```text
[Source: run-live.ts]
s.env.GMS_MODEL,
    }),
  );

  console.log(`[GitCat AI] Running live scenario: ${scenarioName}`);
  console.log(`[GitCat AI] Feature type: ${payload.feature_type}`);
  if (payload.feature_type === 'recommendation') {
    console.log(`[GitCat AI] Recommendation type: ${payload.recommendation_type}`);
  }

  const result = await service.processMergeRequest(payload, { workspaceRoot });
  console.log('[GitCat AI] Parsed result:');
  console.log(JSON.stringify(result, null, 2));
  if (result.feature_type === 'merge_patch_draft') {
    if (result.diff_patch_ref) {
      console.log(
```

### Chunk 5 (133 tokens) 
```text
[Source: run-live.ts]
(result.feature_type === 'merge_patch_draft') {
    if (result.diff_patch_ref) {
      console.log(
        `[GitCat AI] Saved diff patch artifact: ${resolveProposalArtifactPath(
          workspaceRoot,
          result.session_id,
          result.proposal_id,
          result.diff_patch_ref,
        )}`,
      );
    }
    if (result.merged_code_ref) {
      console.log(
        `[GitCat AI] Saved merged code artifact: ${resolveProposalArtifactPath(
          workspaceRoot,
          result.session_id,
          result.proposal_id,
          result.merged_code_ref,
        )}`,
      );
```

### Chunk 6 (66 tokens) 
```text
[Source: run-live.ts]
t.session_id,
          result.proposal_id,
          result.merged_code_ref,
        )}`,
      );
    }
  }
}

main().catch((error) => {
  console.error('[GitCat AI] Live run failed');
  console.error(error);
  process.exit(1);
});
```

