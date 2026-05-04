import { RecommendationInput } from '@gitcat/shared-types';
import { ITruncationStrategy } from './ITruncationStrategy';
import { ModelTokenConfig } from './TokenConfig';
import { TokenCounter } from './TokenCounter';

// diff_summary 최대 길이 (대략 3000자 ≈ ~750~1000 토큰)
const STAGE1_MAX_DIFF_LENGTH = 3000;
const STAGE2_MAX_FILES = 20;

/**
 * RecommendationInput 전용 3단계 절단 전략.
 *
 * 추천 페이로드(커밋 메시지, 브랜치명, PR 설명 등)에는 conflict_candidates가 없으므로
 * MergeTruncationStrategy와 전혀 다른 절단 전략이 필요합니다.
 *
 * 1단계: diff_summary 텍스트 3000자로 자르기
 * 2단계: changed_files 20개로 제한
 * 3단계: change_summary 끝에 경고 메타데이터 삽입
 *         (work_intent 필드 오용을 피하기 위해 change_summary를 사용)
 */
export class RecommendationTruncationStrategy implements ITruncationStrategy<RecommendationInput> {
  constructor(private readonly tokenCounter: TokenCounter) {}

  truncate(payload: RecommendationInput, config: ModelTokenConfig): RecommendationInput {
    let result = { ...payload };
    const initialTokens = this.tokenCounter.countPayloadTokens(payload);

    // 1단계: diff_summary 길이 제한
    result = this.stage1_truncateDiffSummary(result);
    if (this.tokenCounter.countPayloadTokens(result) <= config.safeThresholdTokens) {
      console.log('[RecommendationTruncationStrategy] 1단계(diff_summary 축소)로 해결됨');
      return result;
    }

    // 2단계: changed_files 개수 제한
    result = this.stage2_capChangedFiles(result);
    if (this.tokenCounter.countPayloadTokens(result) <= config.safeThresholdTokens) {
      console.log('[RecommendationTruncationStrategy] 2단계(changed_files 제한)로 해결됨');
      return result;
    }

    // 3단계: change_summary에 경고 삽입
    // (work_intent는 AI가 사용자의 의도로 직접 해석하는 핵심 필드이므로 오염을 피합니다)
    result = this.stage3_appendWarning(result, initialTokens);
    console.warn('[RecommendationTruncationStrategy] 3단계까지 절단했으나 여전히 초과. change_summary에 경고 삽입.');
    return result;
  }

  private stage1_truncateDiffSummary(payload: RecommendationInput): RecommendationInput {
    if (!payload.diff_summary || payload.diff_summary.length <= STAGE1_MAX_DIFF_LENGTH) {
      return payload;
    }
    console.warn(
      `[RecommendationTruncationStrategy] diff_summary ${payload.diff_summary.length}자 → ${STAGE1_MAX_DIFF_LENGTH}자로 제한`
    );
    return {
      ...payload,
      diff_summary:
        payload.diff_summary.substring(0, STAGE1_MAX_DIFF_LENGTH) +
        '\n\n... [DIFF TRUNCATED: 토큰 한도 초과로 이후 Diff 생략됨] ...',
    };
  }

  private stage2_capChangedFiles(payload: RecommendationInput): RecommendationInput {
    if (payload.changed_files.length <= STAGE2_MAX_FILES) return payload;
    console.warn(
      `[RecommendationTruncationStrategy] changed_files ${payload.changed_files.length}개 → ${STAGE2_MAX_FILES}개로 제한`
    );
    return {
      ...payload,
      changed_files: payload.changed_files.slice(0, STAGE2_MAX_FILES),
    };
  }

  private stage3_appendWarning(payload: RecommendationInput, originalTokens: number): RecommendationInput {
    const finalTokens = this.tokenCounter.countPayloadTokens(payload);
    const warning =
      ` [주의: 토큰 예산 초과로 코드 컨텍스트 일부가 생략됨` +
      ` (원본 ${originalTokens}tok → 절단 후 ${finalTokens}tok)]`;
    return {
      ...payload,
      change_summary: payload.change_summary + warning,
    };
  }
}
