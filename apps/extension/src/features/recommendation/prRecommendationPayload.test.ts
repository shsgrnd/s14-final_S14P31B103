import assert from 'node:assert/strict';
import type { RecommendationHistory } from '@gitcat/shared-types';
import {
  createPrRecommendationAiPayload,
  type PrRecommendationOutputLanguage,
} from './prRecommendationPayload';
import type { PrRecommendationRawDataDto } from './PrRecommendationDto';

function createRawData(): PrRecommendationRawDataDto {
  return {
    baseBranch: 'develop',
    currentBranch: 'feat/pr-language-setting',
    diffText: 'diff --git a/a.ts b/a.ts',
    changedFiles: ['apps/extension/src/features/recommendation/PrRecommendationService.ts'],
    commits: [
      {
        hash: 'abc123',
        shortHash: 'abc123',
        message: 'wire PR output language into recommendation payload',
        author: 'GitCat',
        date: '2026-05-19',
        body: '',
      },
    ],
    template: '## Summary\n- Fill me',
  };
}

function createHistoryContext(): RecommendationHistory[] {
  return [
    {
      recommendation_id: 'rec_1',
      ai_request_id: 'ai_1',
      recommendation_type: 'pr_description',
      result_summary: 'recent pr recommendation',
      result_text: 'old result',
      created_at: '2026-05-19T00:00:00Z',
    },
  ];
}

function assertOutputLanguage(outputLanguage: PrRecommendationOutputLanguage): void {
  const payload = createPrRecommendationAiPayload({
    projectId: 'proj_gitcat',
    rawData: createRawData(),
    historyContext: createHistoryContext(),
    outputLanguage,
  });

  assert.equal(payload.recommendation_type, 'pr_description');
  assert.equal(payload.output_language, outputLanguage);
}

function run(): void {
  assertOutputLanguage('ko');
  assertOutputLanguage('en');
  console.log('prRecommendationPayload tests passed');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
