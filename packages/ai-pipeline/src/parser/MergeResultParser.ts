import { FeatureType, ParsedAiResult, ParsedAiResultSchema } from '@gitcat/shared-types';

export class MergeResultParser {
  /**
   * 원시 LLM JSON 텍스트를 정규화된 ParsedAiResult로 파싱
   */
  parse(
    rawText: string,
    featureType: FeatureType,
    sessionId: string
  ): ParsedAiResult {
    let parsedJson: any;
    try {
      // 마크다운 코드 블록(```json ... ```)에서 JSON 추출 시도
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const cleanText = jsonMatch ? jsonMatch[1] : rawText;
      
      parsedJson = JSON.parse(cleanText);
    } catch (e) {
      throw new Error("Failed to parse raw AI response as JSON");
    }

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');

    // LLM이 생성하지 않을 수 있는 필수 기본 필드들을 추가 및 ID 규칙 적용
    const enrichedData = {
      ...parsedJson,
      proposal_id: `aip_${today}_${randomSuffix}`,
      session_id: sessionId,
      ai_request_id: `air_${today}_${randomSuffix}`,
      feature_type: featureType,
      proposal_status: 'parsed',
      parser_version: '1.0.0',
    };

    // Zod 스키마를 사용하여 검증
    const result = ParsedAiResultSchema.parse(enrichedData);
    return result as ParsedAiResult;
  }
}
