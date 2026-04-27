import { AiInputPayloadSchema } from '@gitcat/shared-types';
import { loadRootEnv } from './config/load-root-env';
import { liveDemoScenarios, listLiveDemoScenarioNames } from './demo/live-inputs';
import { MergeAiService } from './merge-proposal/MergeAiService';
import { AiClient } from './provider/AiClient';

function printUsage(): void {
  console.log('Usage: pnpm --filter @gitcat/ai-pipeline run test:live -- <scenario>');
  console.log(`Available scenarios: ${listLiveDemoScenarioNames().join(', ')}`);
  console.log('Env vars: GMS_KEY, GMS_BASE_URL, GMS_MODEL (optional)');
  console.log('Root .env is loaded automatically when present.');
}

async function main(): Promise<void> {
  loadRootEnv();

  const args = process.argv.slice(2).filter((arg) => arg !== '--');
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
  console.log(`[GitCat AI] Feature type: ${payload.feature_type}`);
  if (payload.feature_type === 'recommendation') {
    console.log(`[GitCat AI] Recommendation type: ${payload.recommendation_type}`);
  }

  const result = await service.processMergeRequest(payload);
  console.log('[GitCat AI] Parsed result:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('[GitCat AI] Live run failed');
  console.error(error);
  process.exit(1);
});
