import assert from 'node:assert/strict';
import type { RecommendationInput } from '@gitcat/shared-types';
import { MergeAiService } from './MergeAiService';
import { AiClient } from '../provider/AiClient';

function createRecommendationPayload(): RecommendationInput {
  return {
    project_id: 'proj_local_prompt',
    session_id: 'sess_local_prompt',
    feature_type: 'recommendation',
    recommendation_type: 'commit_message',
    current_branch: 'refactor/ai/local-llm-inference-optimization/S14P31B103-259',
    change_summary: 'Local LLM latency improvements',
    changed_files: ['packages/ai-pipeline/src/provider/AiClient.ts'],
    work_intent: 'Reduce local LLM response latency',
    diff_summary: 'Remove CoT-heavy prompt path and share local runtime',
    branch_context: 'Base branch develop',
    message_constraints: ['Prefer concise commit messages'],
    schema_version: '1.0',
  };
}

function run(): void {
  const payload = createRecommendationPayload();
  const localService = new MergeAiService(new AiClient({
    mode: 'live-local',
    localModelPath: '/tmp/model.gguf',
  }));
  const remoteService = new MergeAiService(new AiClient({
    mode: 'live-remote',
    apiKey: 'dummy',
    baseURL: 'https://example.com/v1',
  }));

  const localPrompt = (localService as any).constructPrompt(payload);
  const remotePrompt = (remoteService as any).constructPrompt(payload);

  assert.equal(localPrompt.systemPrompt.includes('<think>'), false);
  assert.equal(localPrompt.userPrompt.includes('Task (Chain of Thought):'), false);
  assert.equal(localPrompt.userPrompt.includes('Return exactly 3 total candidates'), true);
  assert.equal(localPrompt.localGenerationOptions?.maxTokens, 112);
  assert.equal(remotePrompt.systemPrompt.includes('<think>'), true);
  assert.equal(remotePrompt.userPrompt.includes('Task (Chain of Thought):'), true);
  assert.equal(remotePrompt.localGenerationOptions, undefined);

  console.log('MergeAiService.local-prompt tests passed');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
