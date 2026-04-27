import { FeatureType } from '@gitcat/shared-types';

export interface PromptPayload {
  systemPrompt: string;
  userPrompt: string;
}

export class AiClient {
  /**
   * LLM과 상호작용하기 위한 최소한의 추상 클라이언트
   * featureType에 따라 mock 응답 반환
   */
  async generateResponse(featureType: FeatureType, payload: PromptPayload): Promise<string> {
    // 실제 구현에서는 LLM 제공자에게 API 호출 수행

    switch (featureType) {
      case 'merge_patch_draft':
        return JSON.stringify({
          title: "Resolve adjacent change in index.ts",
          summary: "Combined imports and logic to resolve conflict.",
          explanation: "The changes are non-overlapping but touch the same module.",
          confidence_score: 0.95,
          diff_patch_ref: "patch-12345",
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
      case 'recommendation':
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
      default:
        throw new Error(`Unsupported feature_type for mock: ${featureType}`);
    }
  }
}
