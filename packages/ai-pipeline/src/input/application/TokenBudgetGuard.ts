import { MergeProposalInput, RecommendationInput } from '@gitcat/shared-types';
import { TokenCounter } from './TokenCounter';
import { ContextMinimizer } from './ContextMinimizer';
import { getDefaultModelConfig } from './TokenConfig';

// 2단계 절단 시 최대 파일 수
const STAGE2_MAX_FILES = 20;
// 병합 1단계 절단 시 conflict_candidates 코드 windowSize
const STAGE2_WINDOW = 10;
// 추천 1단계 절단 시 diff_summary 최대 길이 (대략 3000자 = ~1000토큰)
const REC_STAGE1_MAX_SUMMARY_LENGTH = 3000;

/**
 * payload 토큰 초과 시 3단계 cascade 절단을 수행하는 가드 클래스.
 *
 * 병합(MergeProposal) 절단 우선순위:
 *  1단계: conflict_candidates 코드 축소 (20줄 → 10줄)
 *  2단계: related_files 20개로 제한
 *  3단계: risk_summary에 경고 문구 삽입
 * 
 * 추천(Recommendation) 절단 우선순위:
 *  1단계: diff_summary 텍스트 축소 (3000자 제한)
 *  2단계: changed_files 20개로 제한
 *  3단계: work_intent에 경고 문구 삽입
 */
export class TokenBudgetGuard {
  private readonly tokenCounter = new TokenCounter();
  private readonly minimizer = new ContextMinimizer();
  private readonly config = getDefaultModelConfig();

  /**
   * payload가 토큰 한도를 초과하면 단계적으로 절단해 반환합니다.
   * 한도 이내면 payload를 그대로 반환합니다.
   */
  enforce(payload: MergeProposalInput): MergeProposalInput;
  enforce(payload: RecommendationInput): RecommendationInput;
  enforce(payload: MergeProposalInput | RecommendationInput): MergeProposalInput | RecommendationInput {
    const initial = this.tokenCounter.countPayloadTokens(payload);

    if (initial <= this.config.safeThresholdTokens) {
      console.log(`[TokenBudgetGuard] 토큰 OK: ${initial} / ${this.config.safeThresholdTokens}`);
      return payload as any; // 오버로드 타입 호환
    }

    console.warn(`[TokenBudgetGuard] 토큰 초과: ${initial}. 절단 시작.`);

    if (payload.feature_type === 'recommendation') {
      return this.enforceRecommendation(payload, initial);
    } else {
      return this.enforceMergeProposal(payload, initial);
    }
  }

  // --- 병합 제안(MergeProposal) 절단 파이프라인 ---
  private enforceMergeProposal(payload: MergeProposalInput, initialTokens: number): MergeProposalInput {
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
    result = this.stage3_warnOnlyMerge(result, initialTokens);
    console.warn('[TokenBudgetGuard] 3단계까지 절단했으나 여전히 초과. risk_summary에 경고 삽입.');
    return result;
  }

  // --- 추천 기능(Recommendation) 절단 파이프라인 ---
  private enforceRecommendation(payload: RecommendationInput, initialTokens: number): RecommendationInput {
    let result = { ...payload };

    // 1단계: diff_summary 자르기
    result = this.rec_stage1_truncateDiffSummary(result);
    if (this.tokenCounter.countPayloadTokens(result) <= this.config.safeThresholdTokens) {
      console.log('[TokenBudgetGuard] 추천 1단계(diff_summary 축소)로 해결됨');
      return result;
    }

    // 2단계: changed_files 개수 제한
    result = this.rec_stage2_capChangedFiles(result);
    if (this.tokenCounter.countPayloadTokens(result) <= this.config.safeThresholdTokens) {
      console.log('[TokenBudgetGuard] 추천 2단계(changed_files 제한)로 해결됨');
      return result;
    }

    // 3단계: work_intent에 경고 삽입
    result = this.rec_stage3_warnOnly(result, initialTokens);
    console.warn('[TokenBudgetGuard] 추천 3단계까지 절단했으나 여전히 초과. work_intent에 경고 삽입.');
    return result;
  }

  // --- MergeProposal 단계별 상세 로직 ---
  private stage1_shrinkCandidates(payload: MergeProposalInput): MergeProposalInput {
    return {
      ...payload,
      conflict_candidates: payload.conflict_candidates.map(c =>
        this.minimizer.minimizeCandidate(c, STAGE2_WINDOW)
      ),
    };
  }

  private stage2_capRelatedFiles(payload: MergeProposalInput): MergeProposalInput {
    if (payload.related_files.length <= STAGE2_MAX_FILES) return payload;
    console.warn(`[TokenBudgetGuard] related_files ${payload.related_files.length}개 → ${STAGE2_MAX_FILES}개로 제한`);
    return {
      ...payload,
      related_files: payload.related_files.slice(0, STAGE2_MAX_FILES),
    };
  }

  private stage3_warnOnlyMerge(payload: MergeProposalInput, originalTokens: number): MergeProposalInput {
    const finalTokens = this.tokenCounter.countPayloadTokens(payload);
    return {
      ...payload,
      risk_summary:
        `[경고] 토큰 예산 초과로 컨텍스트 최적화 적용됨 ` +
        `(원본 ${originalTokens}tok → 절단 후 ${finalTokens}tok). ` +
        (payload.risk_summary ? payload.risk_summary : ''),
    };
  }

  // --- Recommendation 단계별 상세 로직 ---
  private rec_stage1_truncateDiffSummary(payload: RecommendationInput): RecommendationInput {
    if (!payload.diff_summary || payload.diff_summary.length <= REC_STAGE1_MAX_SUMMARY_LENGTH) {
      return payload;
    }
    console.warn(`[TokenBudgetGuard] diff_summary ${payload.diff_summary.length}자 → ${REC_STAGE1_MAX_SUMMARY_LENGTH}자로 제한`);
    return {
      ...payload,
      diff_summary: payload.diff_summary.substring(0, REC_STAGE1_MAX_SUMMARY_LENGTH) + '\n\n...[DIFF TRUNCATED: 토큰 한도 초과로 생략됨]...',
    };
  }

  private rec_stage2_capChangedFiles(payload: RecommendationInput): RecommendationInput {
    if (payload.changed_files.length <= STAGE2_MAX_FILES) return payload;
    console.warn(`[TokenBudgetGuard] changed_files ${payload.changed_files.length}개 → ${STAGE2_MAX_FILES}개로 제한`);
    return {
      ...payload,
      changed_files: payload.changed_files.slice(0, STAGE2_MAX_FILES),
    };
  }

  private rec_stage3_warnOnly(payload: RecommendationInput, originalTokens: number): RecommendationInput {
    const finalTokens = this.tokenCounter.countPayloadTokens(payload);
    const warningMsg = `\n\n[경고] 토큰 예산 초과로 코드 컨텍스트 일부가 최적화(생략)되었습니다 (원본 ${originalTokens}tok → 절단 후 ${finalTokens}tok).`;
    return {
      ...payload,
      work_intent: payload.work_intent + warningMsg,
    };
  }
}
