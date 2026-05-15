import assert from 'node:assert/strict';
import { AiClient, PromptPayload } from './AiClient';
import { LocalLlamaRuntime } from './LocalLlamaRuntime';

function createPayload(name: string): PromptPayload {
  return {
    systemPrompt: `system:${name}`,
    userPrompt: name,
  };
}

async function testAiClientUsesSharedRuntime(): Promise<void> {
  const originalGetShared = LocalLlamaRuntime.getShared;
  const originalClearShared = LocalLlamaRuntime.clearShared;
  const sharedRuntime = {
    calls: [] as Array<{ payload: PromptPayload; priority: string }>,
    async run(payload: PromptPayload, priority: 'foreground' | 'background') {
      this.calls.push({ payload, priority });
      return JSON.stringify({
        title: 'ok',
        summary: 'ok',
        recommendation_type: 'branch_name',
        primary_text: 'feat/ai/example/S14P31B103-259',
        alternative_texts: [],
      });
    },
  };
  const clearedPaths: string[] = [];

  try {
    (LocalLlamaRuntime as typeof LocalLlamaRuntime & {
      getShared: typeof LocalLlamaRuntime.getShared;
      clearShared: typeof LocalLlamaRuntime.clearShared;
    }).getShared = (() => sharedRuntime as any) as typeof LocalLlamaRuntime.getShared;
    (LocalLlamaRuntime as typeof LocalLlamaRuntime & {
      clearShared: typeof LocalLlamaRuntime.clearShared;
    }).clearShared = ((modelPath?: string) => {
      if (modelPath) {
        clearedPaths.push(modelPath);
      }
    }) as typeof LocalLlamaRuntime.clearShared;

    const clientA = new AiClient({
      mode: 'live-local',
      localModelPath: '/tmp/model.gguf',
    });
    const clientB = new AiClient({
      mode: 'live-local',
      localModelPath: '/tmp/model.gguf',
    });

    await clientA.generateResponse('recommendation', createPayload('first'));
    await clientB.generateResponse('recommendation', createPayload('second'), {
      priority: 'background',
    });

    assert.equal((clientA as any).localRuntime, sharedRuntime);
    assert.equal((clientB as any).localRuntime, sharedRuntime);
    assert.deepEqual(
      sharedRuntime.calls.map((call) => call.priority),
      ['foreground', 'background'],
    );

    clientA.clearLiveClientCache();
    assert.deepEqual(clearedPaths, ['/tmp/model.gguf']);
  } finally {
    (LocalLlamaRuntime as typeof LocalLlamaRuntime & {
      getShared: typeof LocalLlamaRuntime.getShared;
      clearShared: typeof LocalLlamaRuntime.clearShared;
    }).getShared = originalGetShared;
    (LocalLlamaRuntime as typeof LocalLlamaRuntime & {
      clearShared: typeof LocalLlamaRuntime.clearShared;
    }).clearShared = originalClearShared;
  }
}

async function testForegroundQueueWinsOverBackground(): Promise<void> {
  LocalLlamaRuntime.clearShared('queue-model');
  const runtime = LocalLlamaRuntime.getShared('queue-model');
  const started: string[] = [];
  let releaseFirst!: () => void;
  const firstDone = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  (runtime as any).getClient = async () => ({
    callModel: async (payload: PromptPayload) => {
      started.push(payload.userPrompt);
      if (payload.userPrompt === 'fg1') {
        await firstDone;
      }
      return payload.userPrompt;
    },
  });

  const fg1 = runtime.run(createPayload('fg1'), 'foreground');
  const bg = runtime.run(createPayload('bg'), 'background');
  const fg2 = runtime.run(createPayload('fg2'), 'foreground');

  assert.deepEqual(started, ['fg1']);

  releaseFirst();

  const results = await Promise.all([fg1, bg, fg2]);
  assert.deepEqual(results.sort(), ['bg', 'fg1', 'fg2']);
  assert.deepEqual(started, ['fg1', 'fg2', 'bg']);
}

async function run(): Promise<void> {
  await testAiClientUsesSharedRuntime();
  await testForegroundQueueWinsOverBackground();
  console.log('AiClient.local-runtime tests passed');
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
