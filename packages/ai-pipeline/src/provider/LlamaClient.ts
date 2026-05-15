import type {
  LlamaModel,
  LlamaContext,
  LlamaChatSession,
  LLamaChatPromptOptions,
} from 'node-llama-cpp';
import { promises as fs } from 'node:fs';
import type { PromptPayload } from './AiClient';

export interface LlamaClientOptions {
  modelPath: string; // 로컬에 다운로드된 GGUF 모델 파일의 절대 경로
}

export interface LlamaCallMetrics {
  response: string;
  sessionCreateMs: number;
  promptInferMs: number;
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
 * node-llama-cpp를 활용하여 로컬 GGUF 모델로 추론을 수행하는 클라이언트 클래스입니다.
 * 외부 서버(GMS, OpenAI) 의존 없이 완전 오프라인 환경에서 동작합니다.
 */
export class GitCatLlamaClient {
  private modelPath: string;
  private llamaModel: LlamaModel | null = null;
  private llamaContext: LlamaContext | null = null;
  private backendInfo = 'backend info unavailable';

  constructor(options: LlamaClientOptions) {
    this.modelPath = options.modelPath;
  }

  /**
   * 모델과 Context를 초기화합니다.
   * 무거운 GGUF 모델 파일을 메모리에 적재하므로 최초 1회만 실행되도록(싱글톤 패턴과 유사하게) 처리합니다.
   */
  private async initialize(): Promise<void> {
    // 이미 모델과 컨텍스트가 로드되었다면 초기화를 건너뜁니다.
    if (this.llamaModel && this.llamaContext) {
      return;
    }

    const initStartedAt = Date.now();
    try {
      // ESM 모듈인 node-llama-cpp를 CommonJS 환경에서 불러오기 위한 우회 기법
      const nodeLlamaCpp = await new Function("return import('node-llama-cpp')")();
      const getLlama = nodeLlamaCpp.getLlama;

      // 1. llama 엔진 초기화
      const llama = await getLlama();
      // 2. 모델 로드 (GGUF 파일 적재)
      this.llamaModel = await llama.loadModel({
        modelPath: this.modelPath,
      });
      // 3. 컨텍스트 생성 (대화 시퀀스를 관리하기 위한 메모리 공간 할당)
      this.llamaContext = await this.llamaModel!.createContext();
      // 위에서 모델/컨텍스트 초기화를 완료했지만, 타입스크립트는 클래스 필드의 null 가능성을
      // 자동으로 제거하지 못하므로 로컬 상수에 담아 이후 로직에서 안전하게 재사용합니다.
      const loadedModel = this.llamaModel;
      const loadedContext = this.llamaContext;
      if (!loadedModel || !loadedContext) {
        throw new Error('Llama model/context initialized unexpectedly as null.');
      }
      this.backendInfo = this.resolveBackendInfo(llama, loadedModel, loadedContext);

      // 디버그 모드에서는 로컬 모델 준비 단계의 비용을 별도 로그로 남겨
      // cold start 자체가 병목인지 바로 확인할 수 있게 합니다.
      if (isLocalAiDebugEnabled()) {
        const stat = await fs.stat(this.modelPath);
        console.log(
          `[GitCatLlamaClient] ${formatLocalAiSummary({
            event: 'local-model-ready',
            model_path: this.modelPath,
            model_size_bytes: stat.size,
            cold_start: true,
            client_init_ms: Date.now() - initStartedAt,
            backend: this.backendInfo,
          })}`,
        );
      }
    } catch (error) {
      console.error('Failed to initialize Llama model:', error);
      throw new Error(`Failed to load local model from ${this.modelPath}. Please check if the path is correct and the file is a valid GGUF model.`);
    }
  }

  /**
   * 공유 런타임이 모델 초기화를 선행할 수 있도록 공개 준비 메서드를 제공합니다.
   */
  public async ensureReady(): Promise<void> {
    await this.initialize();
  }

  /**
   * 시스템 프롬프트와 유저 프롬프트를 입력받아 로컬 모델에 전달하고, 응답(텍스트)을 반환합니다.
   */
  public async callModel(payload: PromptPayload): Promise<string> {
    const result = await this.callModelDetailed(payload);
    return result.response;
  }

  /**
   * 로컬 추론 시간 분해를 위해 세션 생성과 실제 prompt 추론 시간을 함께 반환합니다.
   */
  public async callModelDetailed(payload: PromptPayload): Promise<LlamaCallMetrics> {
    await this.ensureReady();

    if (!this.llamaContext) {
      throw new Error('LlamaContext is not initialized');
    }

    const nodeLlamaCpp = await new Function("return import('node-llama-cpp')")();
    const LlamaChatSessionCls = nodeLlamaCpp.LlamaChatSession;

    const sessionCreateStartedAt = Date.now();
    // 시퀀스를 할당받습니다.
    const sequence = this.llamaContext.getSequence();

    // 매 요청마다 새로운 채팅 세션을 생성합니다.
    const session = new LlamaChatSessionCls({
      contextSequence: sequence,
      systemPrompt: payload.systemPrompt,
    });
    const sessionCreateMs = Date.now() - sessionCreateStartedAt;

    try {
      // 유저 프롬프트를 전송하고 모델의 답변을 대기합니다.
      const promptInferStartedAt = Date.now();
      // 로컬 추천 경로는 remote와 다르게 "응답 길이 상한" 실험을 자주 하므로,
      // 프롬프트와 함께 전달된 로컬 전용 생성 옵션만 골라서 node-llama-cpp에 넘깁니다.
      const promptOptions: LLamaChatPromptOptions | undefined = payload.localGenerationOptions
        ? {
            ...payload.localGenerationOptions,
          }
        : undefined;
      const response = await session.prompt(payload.userPrompt, promptOptions);
      return {
        response,
        sessionCreateMs,
        promptInferMs: Date.now() - promptInferStartedAt,
      };
    } catch (error) {
      console.error('Llama inference error:', error);
      throw new Error('Local model inference failed.');
    } finally {
      // 다음 요청을 위해 시퀀스를 반환(초기화)합니다.
      if (sequence && typeof sequence.dispose === 'function') {
        sequence.dispose();
      } else if (sequence && typeof sequence.clearHistory === 'function') {
        await sequence.clearHistory();
      }
    }
  }

  private resolveBackendInfo(
    llama: unknown,
    model: LlamaModel,
    context: LlamaContext,
  ): string {
    // node-llama-cpp 버전에 따라 backend/device 정보 노출 위치가 다를 수 있어
    // 몇 가지 흔한 필드를 순서대로 확인하고, 없으면 unavailable로 남깁니다.
    const candidates = [
      (llama as any)?.backend,
      (llama as any)?.backendName,
      (model as any)?.backend,
      (model as any)?.device,
      (context as any)?.backend,
      (context as any)?.device,
    ];

    const resolved = candidates.find(
      (value) => typeof value === 'string' && value.trim().length > 0,
    );

    return resolved ?? 'backend info unavailable';
  }
}
