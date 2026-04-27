import type {
  ConflictCandidateRepository,
  MergeAnalysisRepository,
  MergeProposalRepository,
  ProposalFeedbackRepository,
  RecommendationHistoryRepository,
} from '../../../../../packages/shared-types/src/contracts/repositories';

/**
 * SQLite 접근 어댑터 최소 계약입니다.
 *
 * repository 구현은 이 인터페이스만 의존하고,
 * 실제 드라이버(better-sqlite3/sqlite3 등)는 인프라 계층에서 감쌉니다.
 */
export interface SQLiteDatabaseAdapter {
  run(sql: string, params?: unknown[]): Promise<void>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * 저장소 의존성을 한 번에 주입하기 위한 번들 타입입니다.
 *
 * 백엔드1/백엔드2가 인터페이스 단위로 병렬 개발할 때
 * 조합 지점을 단순화하는 목적입니다.
 */
export interface RepositoryBundle {
  recommendationHistories: RecommendationHistoryRepository;
  proposalFeedbacks: ProposalFeedbackRepository;
  mergeAnalyses: MergeAnalysisRepository;
  conflictCandidates: ConflictCandidateRepository;
  mergeProposals: MergeProposalRepository;
}
