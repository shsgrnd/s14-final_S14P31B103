import assert from 'node:assert/strict';
import type { RecommendationInput } from '@gitcat/shared-types';
import { buildRecommendationUserPrompt } from './recommendation';

function createCommitPayload(): RecommendationInput {
  return {
    project_id: 'proj_local_fast',
    session_id: 'sess_local_fast',
    feature_type: 'recommendation',
    recommendation_type: 'commit_message',
    current_branch: 'refactor/ai/local-llm-performance-optimization/S14P31B103-261',
    change_summary: 'Trim local-fast recommendation input further',
    changed_files: Array.from({ length: 12 }, (_, index) => `packages/file-${index}.ts`),
    work_intent: 'Make live-local recommendation faster without changing extension code',
    diff_summary: 'd'.repeat(2200),
    branch_context: 'b'.repeat(900),
    message_constraints: ['Keep it concise'],
    schema_version: '1.0',
  };
}

function createBranchPayload(): RecommendationInput {
  return {
    project_id: 'proj_local_fast_branch',
    session_id: 'sess_local_fast_branch',
    feature_type: 'recommendation',
    recommendation_type: 'branch_name',
    current_branch: 'test/local-fast-branch',
    work_intent: 'Generate exactly three short branch name candidates',
    branch_context: 'Previous branches: feat/auth, refactor/ui, chore/docs',
    naming_constraints: ['kebab-case', 'prefix-required'],
    schema_version: '1.0',
  };
}

function createPrPayload(): RecommendationInput {
  return {
    project_id: 'proj_local_fast_pr',
    session_id: 'sess_local_fast_pr',
    feature_type: 'recommendation',
    recommendation_type: 'pr_description',
    current_branch: 'refactor/ai/local-llm-performance-optimization/S14P31B103-261',
    change_summary: 'Preserve visible template sections only',
    changed_files: ['apps/extension/src/a.ts', 'apps/extension/src/b.ts'],
    work_intent: 'Generate compact PR descriptions locally',
    diff_summary: 'short diff',
    branch_context: 'Base branch develop with local perf work',
    template: `## Summary\n${'x'.repeat(1500)}`,
    schema_version: '1.0',
  };
}

function run(): void {
  const localCommitPrompt = buildRecommendationUserPrompt(createCommitPayload(), 'local-fast');
  const remoteCommitPrompt = buildRecommendationUserPrompt(createCommitPayload(), 'default');

  // local-fast에서는 불필요한 메타데이터를 제거해 prompt 길이를 줄입니다.
  assert.equal(localCommitPrompt.includes('Project ID:'), false);
  assert.equal(localCommitPrompt.includes('Session ID:'), false);
  assert.equal(localCommitPrompt.includes('Schema Version:'), false);
  assert.equal(localCommitPrompt.includes('Feature Type:'), false);
  assert.equal(localCommitPrompt.includes('packages/file-8.ts'), false);
  assert.equal(localCommitPrompt.length < remoteCommitPrompt.length, true);
  assert.equal(localCommitPrompt.includes('Return exactly 3 total candidates'), true);
  assert.equal(localCommitPrompt.includes('one-line subject only'), true);

  const localBranchPrompt = buildRecommendationUserPrompt(createBranchPayload(), 'local-fast');
  assert.equal(localBranchPrompt.includes('Return exactly 3 total candidates'), true);
  assert.equal(localBranchPrompt.includes('short branch slug only'), true);

  const localPrPrompt = buildRecommendationUserPrompt(createPrPayload(), 'local-fast');
  assert.equal(localPrPrompt.includes('[TRUNCATED FOR LOCAL-FAST]'), true);
  assert.equal(localPrPrompt.includes('alternative_texts empty'), true);

  console.log('recommendation.local-fast tests passed');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
