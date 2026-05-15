import {
  AiInputPayload,
  AiInputPayloadSchema,
  MergeProposalInput,
  ParsedAiResult,
  RecommendationInput,
} from '@gitcat/shared-types';
import { AiClient, PromptPayload } from '../provider/AiClient';
import { RecommendationResultParser } from '../parser/RecommendationResultParser';
import { MergeResultParser } from '../parser/MergeResultParser';
import { AiInputService } from '../input/application/AiInputService';
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
  getRecommendationLocalGenerationOptions,
  getRecommendationSystemPrompt,
  RecommendationPromptVariant,
} from '../prompt/recommendation';

export class MergeAiService {
  private client: AiClient;
  private parser: MergeResultParser;
  private recommendationParser: RecommendationResultParser;
  private aiInputService: AiInputService;

  constructor(
    client: AiClient = new AiClient(),
    parser: MergeResultParser = new MergeResultParser(),
    recommendationParser: RecommendationResultParser = new RecommendationResultParser(),
    aiInputService: AiInputService = new AiInputService(),
  ) {
    this.client = client;
    this.parser = parser;
    this.recommendationParser = recommendationParser;
    this.aiInputService = aiInputService;
  }

  /**
   * 저장된 AI 클라이언트 캐시를 비웁니다.
   */
  public clearCache(): void {
    this.client.clearLiveClientCache();
  }

  /**
   * 입력 페이로드를 기반으로 AI 결과를 생성하고 파싱하는 주 진입점.
   *
   * 흐름: 스키마 검증 → 토큰 최적화(TokenBudgetGuard) → 프롬프트 생성 → AI 호출 → 전용 파서
   */
  async processMergeRequest(
    payload: AiInputPayload,
    options: { workspaceRoot?: string } = {},
  ): Promise<ParsedAiResult> {
    // 1. Zod를 사용하여 입력 페이로드 1차 검증 (구조 및 필수 필드 확인)
    const validatedPayload = AiInputPayloadSchema.parse(payload);

    // 2. feature_type에 따라 전용 타입으로 분기하여 TokenBudgetGuard 적용
    //    AiInputService가 Zod 2차 검증 + TokenBudgetGuard(토큰 절단)를 모두 처리합니다.
    let optimizedPayload: MergeProposalInput | RecommendationInput;
    if (validatedPayload.feature_type === 'recommendation') {
      optimizedPayload = this.aiInputService.processRecommendationInput(validatedPayload);
    } else {
      optimizedPayload = this.aiInputService.processMergeProposalInput(validatedPayload);
    }

    // 3. 최적화된 페이로드로 프롬프트 구성
    const prompt = await this.constructPrompt(optimizedPayload, options.workspaceRoot);

    // 4. AI 클라이언트 호출 (Mock 또는 실재)
    const rawResponse = await this.client.generateResponse(optimizedPayload.feature_type, prompt);

    // 5. feature_type에 따라 적절한 파서로 결과 파싱
    //    recommendation → RecommendationResultParser (Fallback 처리 포함, 동기)
    //    merge 계열    → MergeResultParser (파일 아티팩트 저장 포함, 비동기)
    let parsedResult: ParsedAiResult;
    if (optimizedPayload.feature_type === 'recommendation') {
      parsedResult = this.recommendationParser.parse(
        rawResponse,
        optimizedPayload.session_id ?? '',
        (optimizedPayload as RecommendationInput).recommendation_type,
      );
    } else {
      parsedResult = await this.parser.parse(
        rawResponse,
        optimizedPayload.feature_type,
        optimizedPayload.session_id ?? '',
        { workspaceRoot: options.workspaceRoot },
      );
    }

    return parsedResult;
  }

  /**
   * 특정 기능 유형에 따라 프롬프트 구성
   */
  private async constructPrompt(
    payload: MergeProposalInput | RecommendationInput,
    workspaceRoot?: string,
  ): Promise<PromptPayload> {
    const recommendationVariant: RecommendationPromptVariant = this.client.isLiveLocalMode()
      ? 'local-fast'
      : 'default';

    switch (payload.feature_type) {
      case 'merge_patch_draft':
        return {
          systemPrompt: getMergePatchDraftSystemPrompt(),
          userPrompt: await buildMergePatchDraftUserPrompt(payload as MergeProposalInput, workspaceRoot),
        };
      case 'conflict_explanation':
        return {
          systemPrompt: getConflictExplanationSystemPrompt(),
          userPrompt: await buildConflictUserPrompt(payload as MergeProposalInput, workspaceRoot),
        };
      case 'merge_mediation':
        return {
          systemPrompt: getMergeMediationSystemPrompt(),
          userPrompt: await buildMergeMediationUserPrompt(payload as MergeProposalInput, workspaceRoot),
        };
      case 'recommendation': {
        const recommendationPayload = payload as RecommendationInput;
        return {
          systemPrompt: getRecommendationSystemPrompt(
            recommendationVariant,
            recommendationPayload.recommendation_type,
          ),
          userPrompt: buildRecommendationUserPrompt(
            recommendationPayload,
            recommendationVariant,
          ),
          localGenerationOptions: getRecommendationLocalGenerationOptions(
            recommendationPayload,
            recommendationVariant,
          ),
        };
      }
      default: {
        // 새 feature_type이 추가되면 여기서 바로 드러나도록 방어합니다.
        const _exhaustiveCheck: never = payload;
        throw new Error(`Unsupported feature_type: ${(_exhaustiveCheck as any).feature_type}`);
      }
    }
  }
}
