import { AiInputPayload, ParsedAiResult, AiInputPayloadSchema } from '@gitcat/shared-types';
import { AiClient, PromptPayload } from '../provider/AiClient';
import { MergeResultParser } from '../parser/MergeResultParser';

export class MergeAiService {
  private client: AiClient;
  private parser: MergeResultParser;

  constructor(client: AiClient = new AiClient(), parser: MergeResultParser = new MergeResultParser()) {
    this.client = client;
    this.parser = parser;
  }

  /**
   * 입력 페이로드를 기반으로 AI 결과를 생성하고 파싱하는 주 진입점
   */
  async processMergeRequest(payload: AiInputPayload): Promise<ParsedAiResult> {
    // 1. Zod를 사용하여 입력 페이로드 검증
    const validatedPayload = AiInputPayloadSchema.parse(payload);

    // 2. 프롬프트 구성
    const prompt = this.constructPrompt(validatedPayload);

    // 3. AI 클라이언트 호출 (Mock 또는 실재)
    const rawResponse = await this.client.generateResponse(validatedPayload.feature_type, prompt);

    // 4. Zod를 사용하여 출력 파싱 및 검증
    const parsedResult = this.parser.parse(rawResponse, validatedPayload.feature_type, validatedPayload.session_id);

    return parsedResult;
  }

  /**
   * 특정 기능 유형에 따라 프롬프트 구성
   */
  private constructPrompt(payload: AiInputPayload): PromptPayload {
    const baseSystemPrompt = "You are an expert Git conflict resolution AI. You must return your response ONLY as a valid JSON object.";

    let userPrompt = `Project ID: ${payload.project_id}\nSession ID: ${payload.session_id}\nBranch: ${payload.current_branch} -> ${payload.target_branch}\n`;
    userPrompt += `Conflict Candidates: ${JSON.stringify(payload.conflict_candidates)}\n`;

    switch (payload.feature_type) {
      case 'merge_patch_draft':
        userPrompt += "\nGenerate a 'merge_patch_draft'. The JSON must include: 'title', 'summary', 'diff_patch_ref' or 'merged_code_ref', 'applied_files' (array of strings), 'validation_required' (boolean), and 'validation_summary'. Optional: 'explanation', 'confidence_score'.";
        break;
      case 'conflict_explanation':
        userPrompt += "\nGenerate a 'conflict_explanation'. The JSON must include: 'title', 'summary', 'cause_summary', 'detailed_explanation', 'related_files' (array of strings), 'recommended_resolution_direction', and 'risk_level' (low|medium|high|critical). Optional: 'explanation', 'confidence_score'.";
        break;
      case 'merge_mediation':
        userPrompt += "\nGenerate a 'merge_mediation'. The JSON must include: 'title', 'summary', 'recommended_option', 'tradeoffs' (array of strings), and 'recommended_next_action'. Optional: 'explanation', 'confidence_score'.";
        break;
      case 'recommendation':
        userPrompt = `Project ID: ${payload.project_id}\nSession ID: ${payload.session_id}\nRecommendation Type: ${payload.recommendation_type}\n`;
        userPrompt += `Change Summary: ${payload.change_summary}\nWork Intent: ${payload.work_intent}\nChanged Files: ${JSON.stringify(payload.changed_files)}\n`;
        userPrompt += "\nGenerate a 'recommendation'. The JSON must include: 'title', 'summary', 'recommendation_type', 'primary_text', 'alternative_texts' (array of strings). Optional: 'generation_basis_summary', 'explanation', 'confidence_score'.";
        break;
    }

    return {
      systemPrompt: baseSystemPrompt,
      userPrompt,
    };
  }
}
