import {
  SqliteBranchRepository,
  SqliteConflictCandidateRepository,
  SqliteMergeAnalysisRepository,
  SqliteMergeProposalRepository,
  SqliteProposalFeedbackRepository,
  SqliteRecommendationHistoryRepository,
  SqliteWorktreeRepository,
  type SQLiteDatabase,
} from '@gitcat/storage';
import type { RepositoryBundle } from './interfaces';

/**
 * SQLite 기반 repository 묶음을 생성합니다.
 *
 * 병합 단계 서비스는 이 bundle을 주입받아 분석/후보/제안/피드백 저장소를
 * 개별 구현체에 직접 의존하지 않고 사용할 수 있습니다.
 */
export function createRepositoryBundle(db: SQLiteDatabase): RepositoryBundle {
  return {
    recommendationHistories: new SqliteRecommendationHistoryRepository(db),
    proposalFeedbacks: new SqliteProposalFeedbackRepository(db),
    mergeAnalyses: new SqliteMergeAnalysisRepository(db),
    conflictCandidates: new SqliteConflictCandidateRepository(db),
    mergeProposals: new SqliteMergeProposalRepository(db),
    branches: new SqliteBranchRepository(db),
    worktrees: new SqliteWorktreeRepository(db),
  };
}
