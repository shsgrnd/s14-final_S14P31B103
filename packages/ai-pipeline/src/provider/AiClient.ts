import { FeatureType } from '@gitcat/shared-types';
import {
  GitCatAIClient,
  resolveGmsOpenAiBaseUrl,
} from '../client';
import { loadRootEnv } from '../config/load-root-env';

export interface PromptPayload {
  systemPrompt: string;
  userPrompt: string;
}

export interface AiClientOptions {
  mode?: 'mock' | 'live';
  apiKey?: string;
  apiKeyProvider?: () => Promise<string | undefined>;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  baseURL?: string;
}

export class AiClient {
  private readonly mode: 'mock' | 'live';
  private readonly options: AiClientOptions;
  private liveClient?: GitCatAIClient;

  constructor(options: AiClientOptions = {}) {
    loadRootEnv();
    this.options = options;
    this.mode = options.mode ?? (process.env.GITCAT_AI_MODE === 'live' ? 'live' : 'mock');
  }

  /**
   * mock 모드에서는 빠른 개발용 canned response를 반환하고,
   * live 모드에서는 실제 OpenAI 호출을 수행합니다.
   */
  async generateResponse(featureType: FeatureType, payload: PromptPayload): Promise<string> {
    if (this.mode === 'live') {
      return this.generateLiveResponse(payload);
    }

    return this.generateMockResponse(featureType, payload);
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
        if (promptPayload?.userPrompt.includes('Recommendation Type: branch_name')) {
          recType = 'branch_name';
        } else if (promptPayload?.userPrompt.includes('Recommendation Type: pr_description')) {
          recType = 'pr_description';
        }

        if (recType === 'branch_name') {
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
