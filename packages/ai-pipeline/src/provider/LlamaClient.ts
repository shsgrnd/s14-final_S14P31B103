import { getLlama, LlamaModel, LlamaContext, LlamaChatSession } from 'node-llama-cpp';
import { PromptPayload } from './AiClient';

export interface LlamaClientOptions {
  modelPath: string; // 로컬에 다운로드된 GGUF 모델 파일의 절대 경로
}

/**
 * node-llama-cpp를 활용하여 로컬 GGUF 모델로 추론을 수행하는 클라이언트 클래스입니다.
 * 외부 서버(GMS, OpenAI) 의존 없이 완전 오프라인 환경에서 동작합니다.
 */
export class GitCatLlamaClient {
  private modelPath: string;
  private llamaModel: LlamaModel | null = null;
  private llamaContext: LlamaContext | null = null;

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

    try {
      // 1. llama 엔진 초기화
      const llama = await getLlama();
      // 2. 모델 로드 (GGUF 파일 적재)
      this.llamaModel = await llama.loadModel({
        modelPath: this.modelPath,
      });
      // 3. 컨텍스트 생성 (대화 시퀀스를 관리하기 위한 메모리 공간 할당)
      this.llamaContext = await this.llamaModel.createContext();
    } catch (error) {
      console.error('Failed to initialize Llama model:', error);
      throw new Error(`Failed to load local model from ${this.modelPath}. Please check if the path is correct and the file is a valid GGUF model.`);
    }
  }

  /**
   * 시스템 프롬프트와 유저 프롬프트를 입력받아 로컬 모델에 전달하고, 응답(텍스트)을 반환합니다.
   */
  public async callModel(payload: PromptPayload): Promise<string> {
    await this.initialize();

    if (!this.llamaContext) {
      throw new Error('LlamaContext is not initialized');
    }

    // 매 요청마다 새로운 채팅 세션을 생성합니다.
    // contextSequence를 전달하여 모델의 기존 컨텍스트를 재사용합니다.
    const session = new LlamaChatSession({
      contextSequence: this.llamaContext.getSequence(),
      systemPrompt: payload.systemPrompt,
    });

    try {
      // 유저 프롬프트를 전송하고 모델의 답변을 대기합니다.
      const response = await session.prompt(payload.userPrompt);
      return response;
    } catch (error) {
      console.error('Llama inference error:', error);
      throw new Error('Local model inference failed.');
    }
  }
}
