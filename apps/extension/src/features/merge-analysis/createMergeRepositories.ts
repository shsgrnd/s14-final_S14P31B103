import {
  SqliteChangedFileRepository,
  SqliteChangeRecordRepository,
  SqliteConflictCandidateRepository,
  SqliteMergeAnalysisRepository,
  SqliteMergeProposalRepository,
  SqliteProposalFeedbackRepository,
  SqliteRecommendationHistoryRepository,
  SqliteSnapshotFileRepository,
  SqliteSnapshotRepository,
  type SQLiteDatabase,
} from '@gitcat/storage';
import type { MergeRepositoryBundle } from '../../storage/interfaces';

/**
 * 병합 분석 단계에서 필요한 SQLite repository만 조립합니다.
 *
 * 기능별 서비스/핸들러에는 이 묶음 전체가 아니라 실제로 필요한 항목만 다시 좁혀 주입합니다.
 * 다른 기능도 전역 repository bundle을 공유하지 않고, 기능 폴더 안에서 필요한 repository factory를 따로 둡니다.
 */
export function createMergeRepositories(db: SQLiteDatabase): MergeRepositoryBundle {
  return {
    mergeAnalyses: new SqliteMergeAnalysisRepository(db),
    conflictCandidates: new SqliteConflictCandidateRepository(db),
    mergeProposals: new SqliteMergeProposalRepository(db),
    proposalFeedbacks: new SqliteProposalFeedbackRepository(db),
    recommendationHistories: new SqliteRecommendationHistoryRepository(db),
    snapshots: new SqliteSnapshotRepository(db),
    snapshotFiles: new SqliteSnapshotFileRepository(db),
    changeRecords: new SqliteChangeRecordRepository(db),
    changedFiles: new SqliteChangedFileRepository(db),
  };
}
