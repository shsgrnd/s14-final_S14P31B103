import type {
  MergeFeedbackServiceContract,
  MergeMetadataServiceContract,
} from '../../../../../packages/shared-types/src/contracts/services';
import type {
  ConflictCandidate,
  MergeAnalysisMeta,
  MergeProposal,
  ProposalFeedback,
} from '../../../../../packages/shared-types/src/dto/ai';

/**
 * 병합 분석/제안 오케스트레이터 계약입니다.
 *
 * 1단계 목표는 계약 안정화이므로
 * 실제 분석/제안 생성 로직 대신 저장 흐름 시그니처를 먼저 고정합니다.
 */
export interface MergeOrchestrator extends MergeFeedbackServiceContract, MergeMetadataServiceContract {
  /**
   * 분석 부모 메타데이터를 먼저 저장합니다.
   *
   * 이후 후보/제안 row가 analysis_id를 FK로 참조하므로
   * 일반적으로 가장 먼저 호출됩니다.
   */
  createAnalysisMeta(meta: Omit<MergeAnalysisMeta, 'created_at'>): Promise<MergeAnalysisMeta>;
  /**
   * 충돌 후보 목록을 저장합니다.
   */
  saveConflictCandidates(candidates: ConflictCandidate[]): Promise<void>;
  /**
   * AI가 반환한 병합 제안 메타를 저장합니다.
   */
  saveMergeProposals(proposals: MergeProposal[]): Promise<void>;
  /**
   * 사용자의 제안 선택/수정/거절 결과를 저장합니다.
   *
   * 이 데이터는 이후 추천 품질 개선 피드백으로 재활용됩니다.
   */
  recordProposalFeedback(input: Omit<ProposalFeedback, 'feedback_id' | 'decided_at'>): Promise<void>;
}
