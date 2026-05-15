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
 *  2. JSON.parse() → JS 객체 변환 (실패 시 Fallback 반환)
 *  3. MinimalRecommendationResponseSchema로 1차 경량 검증 (실패 시 Fallback 반환)
 *  4. 시스템 메타데이터 주입 (proposal_id, session_id, recommendation_type 등)
 *  5. RecommendationResultSchema로 최종 Zod 검증 후 반환
 */
export class RecommendationResultParser {
  private static readonly DEBUG_PREVIEW_LENGTH = 120;

  private isDebugLoggingEnabled(): boolean {
    return process.env.GITCAT_AI_DEBUG === '1';
  }

  private buildFailureMessage(code: 'JSON_PARSE_FAILED' | 'RECOMMENDATION_REQUIRED_FIELDS_MISSING'): string {
    switch (code) {
      case 'JSON_PARSE_FAILED':
        return 'JSON_PARSE_FAILED';
      case 'RECOMMENDATION_REQUIRED_FIELDS_MISSING':
        return 'RECOMMENDATION_REQUIRED_FIELDS_MISSING';
    }
  }

  private logParseFailure(input: {
    code: 'JSON_PARSE_FAILED' | 'RECOMMENDATION_REQUIRED_FIELDS_MISSING';
    sessionId: string;
    recommendationType: RecommendationType;
    rawText: string;
  }): void {
    // 운영 로그에서는 원문 일부를 남기지 않고, 어떤 종류의 실패가 났는지만 식별 가능하게 남깁니다.
    // 원문 preview는 디버그 모드에서만 제한 길이로 출력해 민감 문자열 노출면을 줄입니다.
    const baseMessage =
      `[RecommendationResultParser] code=${input.code} ` +
      `recommendation_type=${input.recommendationType} ` +
      `session_id=${input.sessionId || 'empty'} ` +
      `response_length=${input.rawText.length}`;

    if (!this.isDebugLoggingEnabled()) {
      console.warn(baseMessage);
      return;
    }

    const preview = input.rawText
      .replace(/\s+/g, ' ')
      .slice(0, RecommendationResultParser.DEBUG_PREVIEW_LENGTH);

    console.warn(`${baseMessage} preview=${JSON.stringify(preview)}`);
  }

  /**
   * LLM 원시 응답 문자열에서 마크다운 코드블록을 제거하고 순수 JSON 문자열을 반환합니다.
   */
  private cleanResponse(raw: string): string {
    // 1. <think>...</think> 블록 제거
    let text = raw.replace(/<think>[\s\S]*?<\/think>/g, '');

    // 2. 마크다운 블록을 사용했을 경우 내부 텍스트 추출
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    text = jsonMatch ? jsonMatch[1] : text;

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
   * 파싱 실패 시 백엔드/FE에 일관된 규격으로 반환할 Fallback 객체를 생성합니다.
   *
   * docs §6.2 proposal_status 'failed' 값과 §7.5.3 recommendation 필수 필드 기준을 따릅니다.
   * Fallback을 반환함으로써 예외를 전파하지 않고 파이프라인이 안전하게 종료됩니다.
   *
   * @param sessionId 현재 작업 세션 ID
   * @param recommendationType 추천 종류
   * @param reason 실패 원인 (warnings 필드에 기록됨)
   */
  private buildFallback(
    sessionId: string,
    recommendationType: RecommendationType,
    reason: string,
  ): ParsedAiResult {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');

    const fallback = {
      proposal_id: `aip_fallback_${today}_${randomSuffix}`,
      session_id: sessionId,
      ai_request_id: `air_fallback_${today}_${randomSuffix}`,
      feature_type: 'recommendation' as const,
      recommendation_type: recommendationType,
      title: '[AI 추천 실패]',
      summary: 'AI 응답 파싱에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      primary_text: '',
      alternative_texts: [],
      proposal_status: 'failed' as const,
      parser_version: 'v1',
      warnings: [`파싱 실패: ${reason}`],
    };

    return RecommendationResultSchema.parse(fallback) as ParsedAiResult;
  }

  /**
   * LLM 원시 응답 텍스트를 정규화된 ParsedAiResult(recommendation)로 파싱합니다.
   *
   * 파싱 실패(JSON 오류, 스키마 검증 실패) 시 예외를 던지지 않고,
   * proposal_status 'failed'인 Fallback 객체를 반환합니다.
   *
   * @param rawText LLM이 반환한 원시 텍스트 (JSON 또는 마크다운 코드블록 포함)
   * @param sessionId 현재 작업 세션 ID
   * @param recommendationType 추천 종류 (commit_message | branch_name | work_description)
   * @returns Zod 검증을 통과한 ParsedAiResult 객체 (실패 시 Fallback 객체 반환)
   */
  parse(
    rawText: string,
    sessionId: string,
    recommendationType: RecommendationType,
  ): ParsedAiResult {
    // 1. 마크다운 제거 → 순수 JSON 문자열 추출
    const cleanText = this.cleanResponse(rawText);

    // 2. JSON.parse
    // 실패 시나리오 A: LLM이 JSON이 아닌 텍스트를 반환한 경우 → Fallback 반환
    let rawJson: unknown;
    try {
      rawJson = JSON.parse(cleanText);
    } catch (e) {
      const reason = this.buildFailureMessage('JSON_PARSE_FAILED');
      this.logParseFailure({
        code: 'JSON_PARSE_FAILED',
        sessionId,
        recommendationType,
        rawText,
      });
      return this.buildFallback(sessionId, recommendationType, reason);
    }

    // 3. Stage 1: 최소 응답 스키마 검증 (title, primary_text, alternative_texts 존재 여부)
    // 실패 시나리오 B: JSON은 왔으나 필수 필드가 누락된 경우 → Fallback 반환
    let minimalData: Record<string, unknown>;
    try {
      minimalData = MinimalRecommendationResponseSchema.parse(rawJson) as Record<string, unknown>;
    } catch (e) {
      const reason = this.buildFailureMessage('RECOMMENDATION_REQUIRED_FIELDS_MISSING');
      this.logParseFailure({
        code: 'RECOMMENDATION_REQUIRED_FIELDS_MISSING',
        sessionId,
        recommendationType,
        rawText,
      });
      return this.buildFallback(sessionId, recommendationType, reason);
    }

    // 4. 시스템 메타데이터 주입
    const enrichedData = this.enrich(minimalData, sessionId, recommendationType);

    // 5. Stage 2: 최종 RecommendationResultSchema 검증
    const result = RecommendationResultSchema.parse(enrichedData);
    return result as ParsedAiResult;
  }
}
