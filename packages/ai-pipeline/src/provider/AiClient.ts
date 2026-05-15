import { FeatureType } from '@gitcat/shared-types';
import {
  GitCatAIClient,
  resolveGmsOpenAiBaseUrl,
} from '../client';
import { loadRootEnv } from '../config/load-root-env';
import { LocalLlamaRuntime, LocalLlamaRequestPriority } from './LocalLlamaRuntime';

export interface PromptPayload {
  systemPrompt: string;
  userPrompt: string;
}

export interface AiClientOptions {
  mode?: 'mock' | 'live' | 'live-remote' | 'live-local';
  apiKey?: string;
  apiKeyProvider?: () => Promise<string | undefined>;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  baseURL?: string;
  localModelPath?: string;
}

export interface AiRequestOptions {
  priority?: LocalLlamaRequestPriority;
}

export class AiClient {
  private readonly mode: 'mock' | 'live-remote' | 'live-local';
  private readonly options: AiClientOptions;
  private liveClient?: GitCatAIClient;
  private localRuntime?: LocalLlamaRuntime;

  constructor(options: AiClientOptions = {}) {
    loadRootEnv();
    this.options = options;
    
    // 사용자가 명시한 mode 설정이 있다면 우선 적용하고, 없다면 .env 값에 따라 초기화합니다.
    if (options.mode) {
      if (options.mode === 'live') {
        this.mode = 'live-remote'; // 하위 호환성을 위해 'live'는 'live-remote'로 매핑
      } else {
        this.mode = options.mode as 'mock' | 'live-remote' | 'live-local';
      }
    } else {
      this.mode = process.env.GITCAT_AI_MODE === 'live' ? 'live-remote' : 'mock';
    }
  }

  /**
   * mock 모드에서는 빠른 개발용 하드코딩 응답을 반환하고,
   * live-remote 모드에서는 외부 GMS(OpenAI 호환) API 호출을 수행하며,
   * live-local 모드에서는 로컬 오픈소스(Llama) 모델 추론을 수행합니다.
   */
  async generateResponse(
    featureType: FeatureType,
    payload: PromptPayload,
    requestOptions: AiRequestOptions = {},
  ): Promise<string> {
    // 1. 로컬 모델 모드일 경우 LlamaClient 라우팅
    if (this.mode === 'live-local' && this.options.localModelPath) {
      return this.generateLlamaResponse(payload, requestOptions);
    }
    
    // 2. 원격 모델 모드일 경우 기존 외부 API 라우팅
    if (this.mode === 'live-remote' || (this.mode as any) === 'live') {
      return this.generateLiveResponse(payload);
    }

    // 3. 그 외의 경우 Mock 응답 반환
    return this.generateMockResponse(featureType, payload);
  }

  public isLiveLocalMode(): boolean {
    return this.mode === 'live-local' && Boolean(this.options.localModelPath);
  }

  private async generateLlamaResponse(
    payload: PromptPayload,
    requestOptions: AiRequestOptions,
  ): Promise<string> {
    if (!this.options.localModelPath) {
      throw new Error('localModelPath가 설정되지 않았습니다. 로컬 모델을 사용할 수 없습니다.');
    }

    if (!this.localRuntime) {
      this.localRuntime = LocalLlamaRuntime.getShared(this.options.localModelPath);
    }

    return this.localRuntime.run(payload, requestOptions.priority ?? 'foreground');
  }

  private async generateLiveResponse(payload: PromptPayload): Promise<string> {
    if (!this.liveClient) {
      const apiKey = this.options.apiKeyProvider
        ? await this.options.apiKeyProvider()
        : (this.options.apiKey ?? process.env.GMS_KEY);

      const gmsBaseUrl = process.env.GMS_BASE_URL;

      if (!apiKey) {
        throw new Error('AI API Key가 설정되지 않았습니다. 추천을 진행할 수 없습니다.');
      }
      if (!gmsBaseUrl && !this.options.baseURL) {
        throw new Error('AiClient live mode requires GMS_BASE_URL or an explicit baseURL option');
      }

      this.liveClient = new GitCatAIClient({
        apiKey,
        model: this.options.model ?? process.env.GMS_MODEL,
        temperature: this.options.temperature,
        timeoutMs: this.options.timeoutMs,
        baseURL: this.options.baseURL ?? resolveGmsOpenAiBaseUrl(gmsBaseUrl),
      });
    }

    return this.liveClient.callModel(payload);
  }

  /**
   * 저장된 캐시 클라이언트를 초기화합니다. API 키 등이 변경되었을 때 호출합니다.
   */
  public clearLiveClientCache(): void {
    this.liveClient = undefined;
    if (this.options.localModelPath) {
      LocalLlamaRuntime.clearShared(this.options.localModelPath);
    }
    this.localRuntime = undefined;
  }

  private generateMockResponse(featureType: FeatureType, promptPayload?: PromptPayload): string {
    switch (featureType) {
      case 'merge_patch_draft':
        return JSON.stringify({
          title: "Resolve adjacent change in index.ts",
          summary: "Combined imports and logic to resolve conflict.",
          explanation: "The changes are non-overlapping but touch the same module.",
          confidence_score: 0.95,
          diff_patch_ref: "patch-12345",
          diff_patch: [
            "--- a/src/index.ts",
            "+++ b/src/index.ts",
            "@@",
            "-import { oldHelper } from './old';",
            "+import { oldHelper } from './old';",
            "+import { newHelper } from './new';",
          ].join("\n"),
          applied_files: ["src/index.ts"],
          validation_required: true,
          validation_summary: "Run unit tests to ensure imports are correct."
        });
      case 'conflict_explanation':
        return JSON.stringify({
          title: "Explanation for index.ts conflict",
          summary: "Both branches modified the same function signature.",
          cause_summary: "Branch A added a parameter, Branch B renamed the function.",
          detailed_explanation: "The conflict happened because Branch A needed extra context while Branch B was refactoring naming conventions.",
          related_files: ["src/index.ts", "src/api.ts"],
          recommended_resolution_direction: "Adopt Branch A's parameter but use Branch B's name.",
          risk_level: "medium"
        });
      case 'merge_mediation':
        return JSON.stringify({
          title: "Mediation options for index.ts",
          summary: "Two possible ways to resolve the conflict.",
          recommended_option: "Option 1: Accept Both with manual integration.",
          tradeoffs: ["Option 1 takes longer but is safer", "Option 2 is fast but might break backward compatibility"],
          recommended_next_action: "Review Option 1 in the diff viewer."
        });
      case 'recommendation': {
        let recType = 'commit_message';
        // 스냅샷 요약 AI 프롬프트인 경우
        if (promptPayload?.userPrompt.includes('Please summarize the following code changes into a single-line title.')) {
          recType = 'snapshot_summary';
        } else if (promptPayload?.userPrompt.includes('Recommendation Type: branch_name')) {
          recType = 'branch_name';
        } else if (promptPayload?.userPrompt.includes('Recommendation Type: pr_description')) {
          recType = 'pr_description';
        }

        if (recType === 'snapshot_summary') {
          return "Mock 모드 작동 중 (AI 요약이 아닌 테스트 문자열입니다)";
        } else if (recType === 'branch_name') {
          return "```json\n" + JSON.stringify({
            title: "Branch Name Recommendations",
            summary: "Generated branch names based on intent.",
            recommendation_type: "branch_name",
            primary_text: "feat/auth-refactor",
            alternative_texts: [
              "feat/login-response-handling",
              "refactor/auth-dto"
            ],
            confidence_score: 0.95
          }) + "\n```";
        } else if (recType === 'pr_description') {
          return "```json\n" + JSON.stringify({
            title: "PR Description Recommendation",
            summary: "Generated PR description markdown.",
            recommendation_type: "pr_description",
            primary_text: "## 🚀 Overview\n인증 응답 로직과 예외 처리 흐름을 개선했습니다.\n\n## 🛠️ Changes\n- DTO 구조 변경\n- 에러 플로우 수정\n\n## ⚠️ Notes\n충분한 테스트가 필요합니다.",
            alternative_texts: [],
            confidence_score: 0.90
          }) + "\n```";
        } else {
          return "Here is your recommendation:\n```json\n" + JSON.stringify({
            title: "Commit Message Recommendations",
            summary: "Generated commit messages based on your changes.",
            recommendation_type: "commit_message",
            primary_text: "feat(auth): refactor login response handling",
            alternative_texts: [
              "fix: correct exception flow in login service",
              "refactor: improve DTO structure for auth responses"
            ],
            generation_basis_summary: "Detected changes in login service and auth DTOs.",
            explanation: "The changes primarily focus on refactoring the response flow.",
            confidence_score: 0.92
          }) + "\n```";
        }
      }
      default:
        throw new Error(`Unsupported feature_type for mock: ${featureType}`);
    }
  }
}
