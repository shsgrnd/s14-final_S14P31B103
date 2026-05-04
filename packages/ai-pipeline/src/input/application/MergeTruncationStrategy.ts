import { MergeProposalInput } from '@gitcat/shared-types';
import { ITruncationStrategy } from './ITruncationStrategy';
import { ModelTokenConfig } from './TokenConfig';
import { TokenCounter } from './TokenCounter';
import { ContextMinimizer } from './ContextMinimizer';

const STAGE1_WINDOW_SIZE = 10;
const STAGE2_MAX_FILES = 20;

/**
 * MergeProposalInput 전용 3단계 절단 전략.
 *
 * 1단계: conflict_candidates 코드 축소 (20줄 → 10줄 window)
 * 2단계: related_files 20개로 제한
 * 3단계: risk_summary에 경고 문구 삽입
 */
export class MergeTruncationStrategy implements ITruncationStrategy<MergeProposalInput> {
  constructor(
    private readonly tokenCounter: TokenCounter,
    private readonly minimizer: ContextMinimizer,
  ) {}

  truncate(payload: MergeProposalInput, config: ModelTokenConfig): MergeProposalInput {
    let result = { ...payload };

    // 1단계: conflict_candidates 코드 windowSize 축소
    result = this.stage1_shrinkCandidates(result);
    if (this.tokenCounter.countPayloadTokens(result) <= config.safeThresholdTokens) {
      console.log('[MergeTruncationStrategy] 1단계 절단으로 해결됨');
      return result;
    }

    // 2단계: related_files 개수 제한
    result = this.stage2_capRelatedFiles(result);
    if (this.tokenCounter.countPayloadTokens(result) <= config.safeThresholdTokens) {
      console.log('[MergeTruncationStrategy] 2단계 절단으로 해결됨');
      return result;
    }

    // 3단계: risk_summary에 경고 삽입
    const initialTokens = this.tokenCounter.countPayloadTokens(payload);
    result = this.stage3_warnOnly(result, initialTokens);
    console.warn('[MergeTruncationStrategy] 3단계까지 절단했으나 여전히 초과. risk_summary에 경고 삽입.');
    return result;
  }

  private stage1_shrinkCandidates(payload: MergeProposalInput): MergeProposalInput {
    return {
      ...payload,
      conflict_candidates: payload.conflict_candidates.map(c =>
        this.minimizer.minimizeCandidate(c, STAGE1_WINDOW_SIZE)
      ),
    };
  }

  private stage2_capRelatedFiles(payload: MergeProposalInput): MergeProposalInput {
    if (payload.related_files.length <= STAGE2_MAX_FILES) return payload;
    console.warn(`[MergeTruncationStrategy] related_files ${payload.related_files.length}개 → ${STAGE2_MAX_FILES}개로 제한`);
    return {
      ...payload,
      related_files: payload.related_files.slice(0, STAGE2_MAX_FILES),
    };
  }

  private stage3_warnOnly(payload: MergeProposalInput, originalTokens: number): MergeProposalInput {
    const finalTokens = this.tokenCounter.countPayloadTokens(payload);
    return {
      ...payload,
      risk_summary:
        `[경고] 토큰 예산 초과로 컨텍스트 최적화 적용됨 ` +
        `(원본 ${originalTokens}tok → 절단 후 ${finalTokens}tok). ` +
        (payload.risk_summary ?? ''),
    };
  }
}
