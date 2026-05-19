import assert from 'node:assert/strict';
import { getSnapshotSummarySystemPrompt } from './snapshot';

function run(): void {
  const koreanPrompt = getSnapshotSummarySystemPrompt('ko');
  const englishPrompt = getSnapshotSummarySystemPrompt('en');
  const defaultPrompt = getSnapshotSummarySystemPrompt();

  assert.equal(koreanPrompt.includes('Write the summary in Korean.'), true);
  assert.equal(koreanPrompt.includes('README 시작 가이드 오타 수정'), true);

  assert.equal(englishPrompt.includes('Write the summary in English.'), true);
  assert.equal(englishPrompt.includes('Fix README getting started typos'), true);
  assert.equal(englishPrompt.includes('Write the summary in Korean.'), false);

  assert.equal(defaultPrompt.includes('Write the summary in Korean.'), true);

  console.log('snapshot prompt tests passed');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
