import {
  FeatureType,
  ParsedAiResult,
  ParsedAiResultSchema,
  MinimalMergePatchResponseSchema,
} from '@gitcat/shared-types';
import { materializeAiArtifacts } from '../artifacts/merge-result-artifacts';

export interface ParseAiResultOptions {
  workspaceRoot?: string;
}

export class MergeResultParser {
  /**
   * 원시 LLM 응답 문자열에서 JSON 본문만 안전하게 추출합니다.
   */
  private cleanResponse(raw: string): string {
    // 1. <think>...</think> 블록 제거
    let text = raw.replace(/<think>[\s\S]*?<\/think>/g, '');

    // 2. 마크다운 코드블록이 응답 전체를 감싸는 경우에만 내부 JSON을 허용합니다.
    const fencedBlockMatch = text.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/);
    if (fencedBlockMatch) {
      return fencedBlockMatch[1].trim();
    }

    // 3. 코드블록이 있더라도 앞뒤에 설명 문장이 섞여 있으면 실패하게 원문을 그대로 둡니다.
    if (/```(?:json)?/i.test(text)) {
      return text.trim();
    }

    return text.trim();
  }

  /**
   * 최소화된 LLM 응답 데이터에 시스템 메타데이터와 기본값을 주입
   */
  private buildParsedAiResult(
    minimalData: any,
    featureType: FeatureType,
    sessionId: string,
  ): any {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');

    // 기본 시스템 필드
    const enriched = {
      ...minimalData,
      proposal_id: `aip_${today}_${randomSuffix}`,
      session_id: sessionId,
      ai_request_id: `air_${today}_${randomSuffix}`,
      feature_type: featureType,
      proposal_status: 'parsed',
      parser_version: 'v1',
    };

    // 기능별 추가 로직 (예: merge_patch_draft의 applied_files 등)
    if (featureType === 'merge_patch_draft') {
      return {
        ...enriched,
        applied_files: minimalData.applied_files ?? [],
        validation_required: !!minimalData.validation_summary,
      };
    }

    return enriched;
  }

  /**
   * 원시 LLM JSON 텍스트를 정규화된 ParsedAiResult로 파싱 (2단계 검증)
   */
  async parse(
    rawText: string,
    featureType: FeatureType,
    sessionId: string,
    options: ParseAiResultOptions = {},
  ): Promise<ParsedAiResult> {
    // 1. 응답 정제 및 JSON 파싱
    const cleanText = this.cleanResponse(rawText);
    let rawJson: any;
    try {
      rawJson = JSON.parse(cleanText);
    } catch (e) {
      throw new Error('Failed to parse raw AI response as JSON');
    }

    // 2. Stage 1: 최소 응답 스키마 검증 (현재 merge_patch_draft만 적용)
    if (featureType === 'merge_patch_draft') {
      MinimalMergePatchResponseSchema.parse(rawJson);
    }

    // 3. 시스템 필드 주입 (Enrichment)
    const enrichedData = this.buildParsedAiResult(rawJson, featureType, sessionId);

    // 4. 아티팩트 구체화 (Merged Code Ref 생성 등)
    const materializedData = await materializeAiArtifacts({
      workspaceRoot: options.workspaceRoot,
      proposalId: enrichedData.proposal_id,
      sessionId,
      featureType,
      parsedJson: enrichedData,
    });

    // 5. Stage 2: 최종 ParsedAiResult 스키마 검증
    const result = ParsedAiResultSchema.parse(materializedData);
    return result as ParsedAiResult;
  }
}
