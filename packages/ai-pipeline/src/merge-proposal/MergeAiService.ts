import {
  AiInputPayload,
  AiInputPayloadSchema,
  MergeProposalInput,
  ParsedAiResult,
  RecommendationInput,
} from '@gitcat/shared-types';
import { AiClient, PromptPayload } from '../provider/AiClient';
import { MergeResultParser } from '../parser/MergeResultParser';
import {
  buildConflictUserPrompt,
  buildMergeMediationUserPrompt,
  buildMergePatchDraftUserPrompt,
  getConflictExplanationSystemPrompt,
  getMergeMediationSystemPrompt,
  getMergePatchDraftSystemPrompt,
} from '../prompt/merge-conflict';
import {
  buildRecommendationUserPrompt,
  getRecommendationSystemPrompt,
} from '../prompt/recommendation';

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
  async processMergeRequest(
    payload: AiInputPayload,
    options: { workspaceRoot?: string } = {},
  ): Promise<ParsedAiResult> {
    // 1. Zod를 사용하여 입력 페이로드 검증
    const validatedPayload = AiInputPayloadSchema.parse(payload);

    // 2. 프롬프트 구성
    const prompt = this.constructPrompt(validatedPayload);

    // 3. AI 클라이언트 호출 (Mock 또는 실재)
    const rawResponse = await this.client.generateResponse(validatedPayload.feature_type, prompt);

    // 4. Zod를 사용하여 출력 파싱 및 검증
    const parsedResult = await this.parser.parse(
      rawResponse,
      validatedPayload.feature_type,
      validatedPayload.session_id,
      { workspaceRoot: options.workspaceRoot },
    );

    return parsedResult;
  }

  /**
   * 특정 기능 유형에 따라 프롬프트 구성
   */
  private constructPrompt(payload: AiInputPayload): PromptPayload {
    switch (payload.feature_type) {
      case 'merge_patch_draft':
        return {
          systemPrompt: getMergePatchDraftSystemPrompt(),
          // AiInputPayloadSchema에서 merge 계열 필수 필드를 이미 검증했기 때문에
          // 여기서는 merge 전용 payload로 안전하게 해석할 수 있습니다.
          userPrompt: buildMergePatchDraftUserPrompt(payload as MergeProposalInput),
        };
      case 'conflict_explanation':
        return {
          systemPrompt: getConflictExplanationSystemPrompt(),
          userPrompt: buildConflictUserPrompt(payload as MergeProposalInput),
        };
      case 'merge_mediation':
        return {
          systemPrompt: getMergeMediationSystemPrompt(),
          userPrompt: buildMergeMediationUserPrompt(payload as MergeProposalInput),
        };
      case 'recommendation':
        return {
          systemPrompt: getRecommendationSystemPrompt(),
          userPrompt: buildRecommendationUserPrompt(payload as RecommendationInput),
        };
      default: {
        // 새 feature_type이 추가되면 여기서 바로 드러나도록 방어합니다.
        const unsupportedFeature: never = payload.feature_type;
        throw new Error(`Unsupported feature_type: ${unsupportedFeature}`);
      }
    }
  }
}
