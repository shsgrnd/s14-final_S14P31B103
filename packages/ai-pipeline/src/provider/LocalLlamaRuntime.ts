import type { FeatureType } from '@gitcat/shared-types';
import type { PromptPayload } from './AiClient';
import { GitCatLlamaClient } from './LlamaClient';

export type LocalLlamaRequestPriority = 'foreground' | 'background';
const DEFAULT_BACKGROUND_GRACE_MS = 800;

interface LocalLlamaRunOptions {
  featureType: FeatureType;
  priority?: LocalLlamaRequestPriority;
  requestStartedAt: number;
}

interface QueuedRequest {
  payload: PromptPayload;
  featureType: FeatureType;
  priority: LocalLlamaRequestPriority;
  enqueuedAt: number;
  requestStartedAt: number;
  resolve: (value: string) => void;
  reject: (reason?: unknown) => void;
}

interface LocalLlamaClientLease {
  client: GitCatLlamaClient;
  coldStart: boolean;
  clientInitMs: number;
}

function isLocalAiDebugEnabled(): boolean {
  return process.env.GITCAT_AI_LOCAL_DEBUG === '1';
}

function formatLocalAiSummary(fields: Record<string, string | number | boolean>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

/**
 * 동일 모델 경로를 사용하는 로컬 요청은 하나의 런타임과 실행 큐를 공유합니다.
 * foreground 요청을 우선 처리해 사용자 체감 응답성을 높입니다.
 */
export class LocalLlamaRuntime {
  private static readonly runtimes = new Map<string, LocalLlamaRuntime>();

  private readonly foregroundQueue: QueuedRequest[] = [];
  private readonly backgroundQueue: QueuedRequest[] = [];
  private readonly backgroundGraceMs: number;
  private clientPromise?: Promise<GitCatLlamaClient>;
  private isRunning = false;
  private backgroundTimer?: NodeJS.Timeout;

  private constructor(private readonly modelPath: string) {
    const configuredGraceMs = Number(process.env.GITCAT_AI_LOCAL_BACKGROUND_GRACE_MS);
    this.backgroundGraceMs = Number.isFinite(configuredGraceMs) && configuredGraceMs >= 0
      ? configuredGraceMs
      : DEFAULT_BACKGROUND_GRACE_MS;
  }

  public static getShared(modelPath: string): LocalLlamaRuntime {
    let runtime = this.runtimes.get(modelPath);
    if (!runtime) {
      runtime = new LocalLlamaRuntime(modelPath);
      this.runtimes.set(modelPath, runtime);
    }
    return runtime;
  }

  public static clearShared(modelPath?: string): void {
    if (modelPath) {
      const runtime = this.runtimes.get(modelPath);
      runtime?.dispose();
      this.runtimes.delete(modelPath);
      return;
    }

    for (const runtime of this.runtimes.values()) {
      runtime.dispose();
    }
    this.runtimes.clear();
  }

  public async run(
    payload: PromptPayload,
    options: LocalLlamaRunOptions,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const request: QueuedRequest = {
        payload,
        featureType: options.featureType,
        priority: options.priority ?? 'foreground',
        enqueuedAt: Date.now(),
        requestStartedAt: options.requestStartedAt,
        resolve,
        reject,
      };

      if (request.priority === 'background') {
        this.backgroundQueue.push(request);
      } else {
        this.foregroundQueue.push(request);
      }
      this.pumpQueue();
    });
  }

  private pumpQueue(): void {
    if (this.isRunning) {
      return;
    }

    // foreground 요청이 하나라도 있으면 background 예약 실행보다 항상 우선합니다.
    if (this.foregroundQueue.length > 0) {
      this.clearBackgroundTimer();
      const next = this.foregroundQueue.shift();
      if (!next) {
        return;
      }
      this.startRequest(next);
      return;
    }

    if (this.backgroundQueue.length === 0) {
      this.clearBackgroundTimer();
      return;
    }

    // background만 남아 있더라도 바로 실행하지 않고 잠깐 대기합니다.
    // 이 짧은 grace window 동안 foreground가 들어오면 사용자 체감 요청을 먼저 처리합니다.
    if (!this.backgroundTimer) {
      this.backgroundTimer = setTimeout(() => {
        this.backgroundTimer = undefined;
        if (this.isRunning) {
          return;
        }
        const next = this.foregroundQueue.shift() ?? this.backgroundQueue.shift();
        if (!next) {
          return;
        }
        this.startRequest(next);
      }, this.backgroundGraceMs);
    }
  }

  private startRequest(request: QueuedRequest): void {
    this.isRunning = true;
    void this.execute(request);
  }

  private async execute(request: QueuedRequest): Promise<void> {
    try {
      const queueWaitMs = Date.now() - request.enqueuedAt;
      const lease = await this.getClientLease();
      const result = await lease.client.callModelDetailed(request.payload);

      if (isLocalAiDebugEnabled()) {
        console.log(
          `[LocalLlamaRuntime] ${formatLocalAiSummary({
            event: 'local-ai',
            feature: request.featureType,
            cold_start: lease.coldStart,
            priority: request.priority,
            queue_wait_ms: queueWaitMs,
            client_init_ms: lease.clientInitMs,
            session_create_ms: result.sessionCreateMs,
            prompt_infer_ms: result.promptInferMs,
            total_local_ms: Date.now() - request.requestStartedAt,
            system_prompt_chars: request.payload.systemPrompt.length,
            user_prompt_chars: request.payload.userPrompt.length,
          })}`,
        );
      }

      request.resolve(result.response);
    } catch (error) {
      request.reject(error);
    } finally {
      this.isRunning = false;
      this.pumpQueue();
    }
  }

  private async getClientLease(): Promise<LocalLlamaClientLease> {
    // 첫 요청 이후에는 이미 준비된 클라이언트를 재사용하고,
    // cold start 비용은 0으로 고정해 warm path 병목만 따로 읽을 수 있게 합니다.
    if (this.clientPromise) {
      return {
        client: await this.clientPromise,
        coldStart: false,
        clientInitMs: 0,
      };
    }

    const initStartedAt = Date.now();
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const client = new GitCatLlamaClient({ modelPath: this.modelPath });
        await client.ensureReady();
        return client;
      })();
    }

    return {
      client: await this.clientPromise,
      coldStart: true,
      clientInitMs: Date.now() - initStartedAt,
    };
  }

  private clearBackgroundTimer(): void {
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = undefined;
    }
  }

  private dispose(): void {
    this.clearBackgroundTimer();
  }
}
