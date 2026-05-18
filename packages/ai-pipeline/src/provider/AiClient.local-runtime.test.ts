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
    async run(
      payload: PromptPayload,
      options: { priority?: 'foreground' | 'background' },
    ) {
      this.calls.push({ payload, priority: options.priority ?? 'foreground' });
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
  process.env.GITCAT_AI_LOCAL_BACKGROUND_GRACE_MS = '10';
  const runtime = LocalLlamaRuntime.getShared('queue-model');
  const started: string[] = [];
  let releaseFirst!: () => void;
  const firstDone = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  (runtime as any).getClientLease = async () => ({
    coldStart: false,
    clientInitMs: 0,
    client: {
      callModelDetailed: async (payload: PromptPayload) => {
        started.push(payload.userPrompt);
        if (payload.userPrompt === 'fg1') {
          await firstDone;
        }
        return {
          response: payload.userPrompt,
          sessionCreateMs: 1,
          promptInferMs: 1,
        };
      },
    },
  });

  try {
    const fg1 = runtime.run(createPayload('fg1'), {
      featureType: 'recommendation',
      priority: 'foreground',
      requestStartedAt: Date.now(),
    });
    const bg = runtime.run(createPayload('bg'), {
      featureType: 'recommendation',
      priority: 'background',
      requestStartedAt: Date.now(),
    });
    const fg2 = runtime.run(createPayload('fg2'), {
      featureType: 'recommendation',
      priority: 'foreground',
      requestStartedAt: Date.now(),
    });

    // execute()는 내부적으로 비동기 Promise 체인에서 시작되므로,
    // foreground 요청이 실제 실행 상태에 들어갈 때까지 한 틱 기다린 뒤 순서를 확인합니다.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(started, ['fg1']);

    releaseFirst();

    const results = await Promise.all([fg1, bg, fg2]);
    assert.deepEqual(results.sort(), ['bg', 'fg1', 'fg2']);
    assert.deepEqual(started, ['fg1', 'fg2', 'bg']);
  } finally {
    delete process.env.GITCAT_AI_LOCAL_BACKGROUND_GRACE_MS;
  }
}

async function testBackgroundRequestWaitsForGraceWindow(): Promise<void> {
  LocalLlamaRuntime.clearShared('background-grace-model');
  process.env.GITCAT_AI_LOCAL_BACKGROUND_GRACE_MS = '20';
  const runtime = LocalLlamaRuntime.getShared('background-grace-model');
  const started: string[] = [];

  (runtime as any).getClientLease = async () => ({
    coldStart: false,
    clientInitMs: 0,
    client: {
      callModelDetailed: async (payload: PromptPayload) => {
        started.push(payload.userPrompt);
        return {
          response: payload.userPrompt,
          sessionCreateMs: 1,
          promptInferMs: 1,
        };
      },
    },
  });

  try {
    const backgroundPromise = runtime.run(createPayload('bg-only'), {
      featureType: 'recommendation',
      priority: 'background',
      requestStartedAt: Date.now(),
    });

    assert.deepEqual(started, []);

    await new Promise((resolve) => setTimeout(resolve, 30));
    const result = await backgroundPromise;
    assert.equal(result, 'bg-only');
    assert.deepEqual(started, ['bg-only']);
  } finally {
    delete process.env.GITCAT_AI_LOCAL_BACKGROUND_GRACE_MS;
  }
}

async function testLocalDebugLogIncludesTimingFields(): Promise<void> {
  LocalLlamaRuntime.clearShared('debug-model');
  process.env.GITCAT_AI_LOCAL_BACKGROUND_GRACE_MS = '0';
  process.env.GITCAT_AI_LOCAL_DEBUG = '1';
  const runtime = LocalLlamaRuntime.getShared('debug-model');
  const originalConsoleLog = console.log;
  const logs: string[] = [];

  (runtime as any).getClientLease = async () => ({
    coldStart: true,
    clientInitMs: 42,
    client: {
      callModelDetailed: async () => ({
        response: 'ok',
        sessionCreateMs: 7,
        promptInferMs: 15,
      }),
    },
  });

  console.log = (...args: unknown[]) => {
    logs.push(args.join(' '));
  };

  try {
    await runtime.run(createPayload('debug'), {
      featureType: 'recommendation',
      priority: 'foreground',
      requestStartedAt: Date.now(),
    });
  } finally {
    console.log = originalConsoleLog;
    delete process.env.GITCAT_AI_LOCAL_BACKGROUND_GRACE_MS;
    delete process.env.GITCAT_AI_LOCAL_DEBUG;
  }

  const localAiLog = logs.find((line) => line.includes('event=local-ai'));
  assert.ok(localAiLog);
  assert.match(localAiLog, /queue_wait_ms=/);
  assert.match(localAiLog, /client_init_ms=42/);
  assert.match(localAiLog, /session_create_ms=7/);
  assert.match(localAiLog, /prompt_infer_ms=15/);
}

async function run(): Promise<void> {
  await testAiClientUsesSharedRuntime();
  await testForegroundQueueWinsOverBackground();
  await testBackgroundRequestWaitsForGraceWindow();
  await testLocalDebugLogIncludesTimingFields();
  console.log('AiClient.local-runtime tests passed');
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
