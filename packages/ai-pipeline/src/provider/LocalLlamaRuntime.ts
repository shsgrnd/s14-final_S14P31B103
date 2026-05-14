import type { PromptPayload } from './AiClient';
import { GitCatLlamaClient } from './LlamaClient';

export type LocalLlamaRequestPriority = 'foreground' | 'background';

interface QueuedRequest {
  payload: PromptPayload;
  priority: LocalLlamaRequestPriority;
  resolve: (value: string) => void;
  reject: (reason?: unknown) => void;
}

/**
 * 동일 모델 경로를 사용하는 로컬 요청은 하나의 런타임과 실행 큐를 공유합니다.
 * foreground 요청을 우선 처리해 사용자 체감 응답성을 높입니다.
 */
export class LocalLlamaRuntime {
  private static readonly runtimes = new Map<string, LocalLlamaRuntime>();

  private readonly foregroundQueue: QueuedRequest[] = [];
  private readonly backgroundQueue: QueuedRequest[] = [];
  private clientPromise?: Promise<GitCatLlamaClient>;
  private isRunning = false;

  private constructor(private readonly modelPath: string) {}

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
      this.runtimes.delete(modelPath);
      return;
    }

    this.runtimes.clear();
  }

  public async run(
    payload: PromptPayload,
    priority: LocalLlamaRequestPriority = 'foreground',
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const request: QueuedRequest = { payload, priority, resolve, reject };
      if (priority === 'background') {
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

    const next = this.foregroundQueue.shift() ?? this.backgroundQueue.shift();
    if (!next) {
      return;
    }

    this.isRunning = true;
    void this.execute(next);
  }

  private async execute(request: QueuedRequest): Promise<void> {
    try {
      const client = await this.getClient();
      const response = await client.callModel(request.payload);
      request.resolve(response);
    } catch (error) {
      request.reject(error);
    } finally {
      this.isRunning = false;
      this.pumpQueue();
    }
  }

  private async getClient(): Promise<GitCatLlamaClient> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const client = new GitCatLlamaClient({ modelPath: this.modelPath });
        await client.ensureReady();
        return client;
      })();
    }

    return this.clientPromise;
  }
}
