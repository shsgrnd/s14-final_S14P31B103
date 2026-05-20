import assert from 'node:assert/strict';
import type { RecommendationInput } from '@gitcat/shared-types';
import {
  buildRecommendationUserPrompt,
  getRecommendationSystemPrompt,
} from './recommendation';

type PrRecommendationTestInput = Extract<
  RecommendationInput,
  { recommendation_type: 'pr_description' }
>;

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

function createPrPayload(): PrRecommendationTestInput {
  return {
    project_id: 'proj_local_fast_pr_no_template',
    session_id: 'sess_local_fast_pr_no_template',
    feature_type: 'recommendation',
    recommendation_type: 'pr_description',
    current_branch: 'refactor/ai/local-llm-performance-optimization/S14P31B103-261',
    change_summary: 'Generate Korean PR content by default',
    changed_files: ['apps/extension/src/a.ts', 'apps/extension/src/b.ts'],
    work_intent: 'Generate compact PR descriptions locally',
    diff_summary: 'short diff',
    branch_context: 'Base branch develop with local perf work',
    schema_version: '1.0',
  };
}

function createEnglishOutputPrPayload(): PrRecommendationTestInput {
  return {
    ...createPrPayload(),
    project_id: 'proj_local_fast_pr_en_output',
    session_id: 'sess_local_fast_pr_en_output',
    change_summary: 'Generate English PR content from language setting',
    output_language: 'en',
  };
}

function createLongTemplatePrPayload(): PrRecommendationTestInput {
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

function createEnglishTemplatePrPayload(): PrRecommendationTestInput {
  return {
    project_id: 'proj_local_fast_pr_en',
    session_id: 'sess_local_fast_pr_en',
    feature_type: 'recommendation',
    recommendation_type: 'pr_description',
    current_branch: 'feat/pr-template-language-handling',
    change_summary: 'Preserve English PR template language',
    changed_files: ['apps/extension/src/a.ts'],
    work_intent: 'Generate PR content that follows the selected template language',
    diff_summary: 'short diff',
    branch_context: 'Base branch main with PR template integration work',
    template: [
      '## Summary',
      '- Please describe the main change.',
      '',
      '## Testing',
      '- How did you verify this?',
    ].join('\n'),
    schema_version: '1.0',
  };
}

function createEnglishTemplateKoreanOutputPrPayload(): PrRecommendationTestInput {
  return {
    ...createEnglishTemplatePrPayload(),
    project_id: 'proj_local_fast_pr_en_template_ko_output',
    session_id: 'sess_local_fast_pr_en_template_ko_output',
    change_summary: 'Prefer Korean output even with English template',
    output_language: 'ko',
  };
}

function run(): void {
  const localSystemPrompt = getRecommendationSystemPrompt('local-fast', 'commit_message');
  const remoteSystemPrompt = getRecommendationSystemPrompt('default', 'commit_message');

  assert.equal(localSystemPrompt.includes('recommendation_type'), true);
  assert.equal(localSystemPrompt.includes('Do not include recommendation_type in the JSON'), true);
  assert.equal(localSystemPrompt.includes('Return only these required fields: title, summary, primary_text, alternative_texts.'), true);
  assert.equal(remoteSystemPrompt.includes('Required JSON fields: title, summary, primary_text, alternative_texts.'), true);
  assert.equal(remoteSystemPrompt.includes('Do not include recommendation_type in the JSON'), true);

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
  assert.equal(localPrPrompt.includes('Write both title and primary_text in Korean by default.'), true);
  assert.equal(localPrPrompt.includes('use Korean section headings, body text, and bullets'), true);

  const remotePrPrompt = buildRecommendationUserPrompt(createPrPayload(), 'default');
  assert.equal(remotePrPrompt.includes('제목(title)과 primary_text(PR 본문)는 기본적으로 모두 한국어로 작성한다.'), true);
  assert.equal(remotePrPrompt.includes('template가 없다면 섹션 제목, 본문, 불릿도 한국어로 작성한다.'), true);

  const localEnglishOutputPrPrompt = buildRecommendationUserPrompt(createEnglishOutputPrPayload(), 'local-fast');
  assert.equal(localEnglishOutputPrPrompt.includes('Write both title and primary_text in English.'), true);
  assert.equal(localEnglishOutputPrPrompt.includes('If no template is provided, use English section headings, body text, and bullets.'), true);
  assert.equal(localEnglishOutputPrPrompt.includes('Write both title and primary_text in Korean by default.'), false);

  const remoteEnglishOutputPrPrompt = buildRecommendationUserPrompt(createEnglishOutputPrPayload(), 'default');
  assert.equal(remoteEnglishOutputPrPrompt.includes('제목(title)과 primary_text(PR 본문)는 모두 영어로 작성한다.'), true);
  assert.equal(remoteEnglishOutputPrPrompt.includes('template가 없다면 섹션 제목, 본문, 불릿도 영어로 작성한다.'), true);
  assert.equal(remoteEnglishOutputPrPrompt.includes('제목(title)과 primary_text(PR 본문)는 기본적으로 모두 한국어로 작성한다.'), false);

  const localLongTemplatePrPrompt = buildRecommendationUserPrompt(createLongTemplatePrPayload(), 'local-fast');
  assert.equal(localLongTemplatePrPrompt.includes('[TRUNCATED FOR LOCAL-FAST]'), true);
  assert.equal(localLongTemplatePrPrompt.includes('alternative_texts empty'), true);

  const localEnglishTemplateKoreanOutputPrompt = buildRecommendationUserPrompt(createEnglishTemplateKoreanOutputPrPayload(), 'local-fast');
  assert.equal(localEnglishTemplateKoreanOutputPrompt.includes('Write both title and primary_text in Korean.'), true);
  assert.equal(localEnglishTemplateKoreanOutputPrompt.includes('preserve markdown section heading lines exactly as written in the template'), true);
  assert.equal(localEnglishTemplateKoreanOutputPrompt.includes('Rewrite every non-heading visible text in Korean'), true);
  assert.equal(localEnglishTemplateKoreanOutputPrompt.includes('checklist items, bullet text, placeholder text, helper notes, and prose'), true);
  assert.equal(localEnglishTemplateKoreanOutputPrompt.includes('write both title and primary_text in English.'), false);

  const remoteEnglishTemplateKoreanOutputPrompt = buildRecommendationUserPrompt(createEnglishTemplateKoreanOutputPrPayload(), 'default');
  assert.equal(remoteEnglishTemplateKoreanOutputPrompt.includes('제목(title)과 primary_text(PR 본문)는 모두 한국어로 작성한다.'), true);
  assert.equal(remoteEnglishTemplateKoreanOutputPrompt.includes('마크다운 섹션 heading 줄 자체는 template 원문 그대로 유지한다.'), true);
  assert.equal(remoteEnglishTemplateKoreanOutputPrompt.includes('heading이 아닌 모든 visible text는 한국어로 다시 작성한다.'), true);
  assert.equal(remoteEnglishTemplateKoreanOutputPrompt.includes('both title and primary_text must stay in English.'), false);

  const localEnglishTemplatePrPrompt = buildRecommendationUserPrompt(createEnglishTemplatePrPayload(), 'local-fast');
  assert.equal(localEnglishTemplatePrPrompt.includes('write both title and primary_text in English.'), true);
  assert.equal(localEnglishTemplatePrPrompt.includes('Preserve markdown section heading lines exactly as written in the template'), true);
  assert.equal(localEnglishTemplatePrPrompt.includes('keep newly written non-heading text in English'), true);
  assert.equal(localEnglishTemplatePrPrompt.includes('Write both title and primary_text in Korean by default.'), false);

  const remoteEnglishTemplatePrPrompt = buildRecommendationUserPrompt(createEnglishTemplatePrPayload(), 'default');
  assert.equal(remoteEnglishTemplatePrPrompt.includes('both title and primary_text must stay in English.'), true);
  assert.equal(remoteEnglishTemplatePrPrompt.includes('제목(title)과 primary_text(PR 본문)는 기본적으로 모두 한국어로 작성한다.'), false);

  console.log('recommendation.local-fast tests passed');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
