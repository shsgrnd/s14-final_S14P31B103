import { MergeProposalInput } from '@gitcat/shared-types';
import { TokenCounter } from './TokenCounter';
import { ContextMinimizer } from './ContextMinimizer';
import { getDefaultModelConfig } from './TokenConfig';

// 2단계 절단 시 related_files 최대 개수
const STAGE2_MAX_FILES = 20;
// 2단계 절단 시 conflict_candidates 코드 windowSize
const STAGE2_WINDOW = 10;

/**
 * payload 토큰 초과 시 3단계 cascade 절단을 수행하는 가드 클래스.
 *
 * 절단 우선순위:
 *  1단계: conflict_candidates 코드 축소 (20줄 → 10줄)
 *  2단계: related_files 20개로 제한
 *  3단계: risk_summary에 경고 문구 삽입 (더 이상 줄일 수 없을 때)
 */
export class TokenBudgetGuard {
  private readonly tokenCounter = new TokenCounter();
  private readonly minimizer = new ContextMinimizer();
  private readonly config = getDefaultModelConfig();

  /**
   * payload가 토큰 한도를 초과하면 단계적으로 절단해 반환합니다.
   * 한도 이내면 payload를 그대로 반환합니다.
   */
  enforce(payload: MergeProposalInput): MergeProposalInput {
    const initial = this.tokenCounter.countPayloadTokens(payload);

    if (initial <= this.config.safeThresholdTokens) {
      console.log(`[TokenBudgetGuard] 토큰 OK: ${initial} / ${this.config.safeThresholdTokens}`);
      return payload;
    }

    console.warn(`[TokenBudgetGuard] 토큰 초과: ${initial}. 절단 시작.`);
    let result = { ...payload };

    // 1단계: conflict_candidates 코드 windowSize 축소
    result = this.stage1_shrinkCandidates(result);
    if (this.tokenCounter.countPayloadTokens(result) <= this.config.safeThresholdTokens) {
      console.log('[TokenBudgetGuard] 1단계 절단으로 해결됨');
      return result;
    }

    // 2단계: related_files 개수 제한
    result = this.stage2_capRelatedFiles(result);
    if (this.tokenCounter.countPayloadTokens(result) <= this.config.safeThresholdTokens) {
      console.log('[TokenBudgetGuard] 2단계 절단으로 해결됨');
      return result;
    }

    // 3단계: 경고 삽입
    result = this.stage3_warnOnly(result, initial);
    console.warn('[TokenBudgetGuard] 3단계까지 절단했으나 여전히 초과. risk_summary에 경고 삽입.');
    return result;
  }

  /** 1단계: conflict_candidates 코드를 10줄 window로 축소 */
  private stage1_shrinkCandidates(payload: MergeProposalInput): MergeProposalInput {
    return {
      ...payload,
      conflict_candidates: payload.conflict_candidates.map(c =>
        this.minimizer.minimizeCandidate(c, STAGE2_WINDOW)
      ),
    };
  }

  /** 2단계: related_files를 앞 20개로 제한 */
  private stage2_capRelatedFiles(payload: MergeProposalInput): MergeProposalInput {
    if (payload.related_files.length <= STAGE2_MAX_FILES) return payload;
    console.warn(`[TokenBudgetGuard] related_files ${payload.related_files.length}개 → ${STAGE2_MAX_FILES}개로 제한`);
    return {
      ...payload,
      related_files: payload.related_files.slice(0, STAGE2_MAX_FILES),
    };
  }

  /** 3단계: risk_summary에 경고 문구 삽입 */
  private stage3_warnOnly(payload: MergeProposalInput, originalTokens: number): MergeProposalInput {
    const finalTokens = this.tokenCounter.countPayloadTokens(payload);
    return {
      ...payload,
      risk_summary:
        `[경고] 토큰 예산 초과로 컨텍스트 최적화 적용됨 ` +
        `(원본 ${originalTokens}tok → 절단 후 ${finalTokens}tok). ` +
        (payload.risk_summary ? payload.risk_summary : ''),
    };
  }
}
