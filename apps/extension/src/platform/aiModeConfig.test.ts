import assert from 'node:assert/strict';
import {
  LEGACY_AI_MODE_MIGRATION_NOTICE,
  LEGACY_MOCK_MODE_WARNING,
  normalizeExtensionAiMode,
  shouldMigrateStoredAiMode,
} from './aiModeConfig';

function run(): void {
  assert.equal(LEGACY_AI_MODE_MIGRATION_NOTICE.includes('live-local'), true);

  assert.deepEqual(normalizeExtensionAiMode('live-local'), {
    rawMode: 'live-local',
    mode: 'live-local',
  });

  assert.deepEqual(normalizeExtensionAiMode('live-remote'), {
    rawMode: 'live-remote',
    mode: 'live-remote',
  });

  assert.deepEqual(normalizeExtensionAiMode('live'), {
    rawMode: 'live',
    mode: 'live-remote',
  });

  assert.deepEqual(normalizeExtensionAiMode('mock'), {
    rawMode: 'mock',
    mode: 'live-local',
    warningMessage: LEGACY_MOCK_MODE_WARNING,
  });

  assert.equal(shouldMigrateStoredAiMode('mock'), true);
  assert.equal(shouldMigrateStoredAiMode('live'), true);
  assert.equal(shouldMigrateStoredAiMode('live-remote'), true);
  assert.equal(shouldMigrateStoredAiMode('live-local'), false);
  assert.equal(shouldMigrateStoredAiMode(undefined), false);

  console.log('aiModeConfig tests passed');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
