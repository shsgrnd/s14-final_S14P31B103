import { z } from 'zod';
import {
  ConflictCandidateRowSchema,
  MergeAnalysisRowSchema,
  MergeProposalRowSchema,
  ProposalFeedbackRowSchema,
  RecommendationHistoryRowSchema,
} from '../schemas/storage';

/**
 * 저장소 Row 스키마에서 추론한 타입 별칭 모음입니다.
 *
 * 목적:
 * - 스키마(런타임 검증)와 타입(컴파일 검증) 간 드리프트 방지
 * - repository 인터페이스에서 일관된 row 타입 재사용
 */
export type RecommendationHistoryRow = z.infer<typeof RecommendationHistoryRowSchema>;
export type ProposalFeedbackRow = z.infer<typeof ProposalFeedbackRowSchema>;
export type MergeAnalysisRow = z.infer<typeof MergeAnalysisRowSchema>;
export type ConflictCandidateRow = z.infer<typeof ConflictCandidateRowSchema>;
export type MergeProposalRow = z.infer<typeof MergeProposalRowSchema>;
