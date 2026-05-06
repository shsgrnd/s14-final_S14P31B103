import {
  RecommendationType,
  ParsedAiResult,
  RecommendationResultSchema,
  MinimalRecommendationResponseSchema,
} from '@gitcat/shared-types';

/**
 * LLM이 반환한 원시 텍스트를 recommendation 전용 ParsedAiResult로 변환하는 파서.
 *
 * MergeResultParser와 달리 아티팩트 파일 저장(materializeAiArtifacts)을 수행하지 않습니다.
 * docs AI_work_breakdown.md §7.5.3 기준에 따라 시스템 메타데이터를 후처리로 주입합니다.
 *
 * 파싱 파이프라인:
 *  1. 마크다운 제거 → 순수 JSON 문자열 추출
 *  2. JSON.parse() → JS 객체 변환
 *  3. MinimalRecommendationResponseSchema로 1차 경량 검증 (title, primary_text 등 필수 확인)
 *  4. 시스템 메타데이터 주입 (proposal_id, session_id, recommendation_type 등)
 *  5. RecommendationResultSchema로 최종 Zod 검증 후 반환
 */
export class RecommendationResultParser {
  /**
   * LLM 원시 응답 문자열에서 마크다운 코드블록을 제거하고 순수 JSON 문자열을 반환합니다.
   */
  private cleanResponse(raw: string): string {
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const text = jsonMatch ? jsonMatch[1] : raw;
    return text.trim();
  }

  /**
   * MinimalRecommendationResponse에 시스템 메타데이터를 주입하여 enriched 객체를 생성합니다.
   *
   * ID 형식은 docs §6.1에 따릅니다:
   *   proposal_id: aip_YYYYMMDD_NNN
   *   ai_request_id: air_YYYYMMDD_NNN
   */
  private enrich(
    minimalData: Record<string, unknown>,
    sessionId: string,
    recommendationType: RecommendationType,
  ): Record<string, unknown> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');

    return {
      ...minimalData,
      proposal_id: `aip_${today}_${randomSuffix}`,
      session_id: sessionId,
      ai_request_id: `air_${today}_${randomSuffix}`,
      feature_type: 'recommendation' as const,
      recommendation_type: recommendationType,
      proposal_status: 'parsed',
      parser_version: 'v1',
    };
  }

  /**
   * LLM 원시 응답 텍스트를 정규화된 ParsedAiResult(recommendation)로 파싱합니다.
   *
   * @param rawText LLM이 반환한 원시 텍스트 (JSON 또는 마크다운 코드블록 포함)
   * @param sessionId 현재 작업 세션 ID
   * @param recommendationType 추천 종류 (commit_message | branch_name | work_description)
   * @returns Zod 검증을 통과한 ParsedAiResult 객체
   * @throws 파싱 실패 시 Error (Fallback 처리는 [AI-03-2]에서 추가)
   */
  parse(
    rawText: string,
    sessionId: string,
    recommendationType: RecommendationType,
  ): ParsedAiResult {
    // 1. 마크다운 제거 → 순수 JSON 문자열 추출
    const cleanText = this.cleanResponse(rawText);

    // 2. JSON.parse
    let rawJson: unknown;
    try {
      rawJson = JSON.parse(cleanText);
    } catch (e) {
      throw new Error(
        `[RecommendationResultParser] JSON 파싱 실패: LLM이 JSON 형식이 아닌 응답을 반환했습니다. ` +
        `원본 응답 앞 200자: ${rawText.substring(0, 200)}`,
      );
    }

    // 3. Stage 1: 최소 응답 스키마 검증 (title, primary_text, alternative_texts 존재 여부)
    const minimalData = MinimalRecommendationResponseSchema.parse(rawJson);

    // 4. 시스템 메타데이터 주입
    const enrichedData = this.enrich(
      minimalData as Record<string, unknown>,
      sessionId,
      recommendationType,
    );

    // 5. Stage 2: 최종 RecommendationResultSchema 검증
    const result = RecommendationResultSchema.parse(enrichedData);
    return result as ParsedAiResult;
  }
}
