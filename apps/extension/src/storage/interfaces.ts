import type {
  ConflictCandidateRepository,
  BranchRepository,
  MergeAnalysisRepository,
  MergeProposalRepository,
  ProposalFeedbackRepository,
  RecommendationHistoryRepository,
  WorktreeRepository,
} from '@gitcat/shared-types/src/interfaces/repositories';
import { SnapshotMeta } from '../core/types';

/**
 * 단일 마이그레이션 단위입니다.
 */
export interface SqlMigration {
  version: number;
  name: string;
  sql: string;
}

/**
 * SQLite 스키마 부트스트랩 계약입니다.
 */
export interface SqliteSchemaBootstrapper {
  getMigrations(): SqlMigration[];
  migrate(): Promise<void>;
}

/**
 * SQLite 접근 어댑터 최소 계약입니다.
 */
export interface SQLiteDatabaseAdapter {
  run(sql: string, params?: unknown[]): Promise<void>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * 저장소 의존성을 한 번에 주입하기 위한 번들 타입입니다.
 */
export interface RepositoryBundle {
  recommendationHistories: RecommendationHistoryRepository;
  proposalFeedbacks: ProposalFeedbackRepository;
  mergeAnalyses: MergeAnalysisRepository;
  conflictCandidates: ConflictCandidateRepository;
  mergeProposals: MergeProposalRepository;
  branches: BranchRepository;
  worktrees: WorktreeRepository;

  // workSessions: WorkSessionRepository;
  // snapshots: SnapshotRepository;
  // changeRecords: ChangeRecordRepository;
}
