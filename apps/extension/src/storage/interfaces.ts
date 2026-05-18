import type {
  ConflictCandidateRepository,
  MergeAnalysisRepository,
  MergeProposalRepository,
  ProposalFeedbackRepository,
} from '@gitcat/shared-types/src/interfaces/repositories';

/**
 * SQL 마이그레이션 단위입니다.
 */
export interface SqlMigration {
  version: number;
  name: string;
  sql: string;
}

/**
 * SQLite 스키마 초기화를 담당합니다.
 */
export interface SqliteSchemaBootstrapper {
  getMigrations(): SqlMigration[];
  migrate(): Promise<void>;
}

/**
 * SQLite 클라이언트가 제공해야 하는 최소 실행 인터페이스입니다.
 */
export interface SQLiteDatabaseAdapter {
  run(sql: string, params?: unknown[]): Promise<void>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * 병합 기능 서비스/핸들러에서만 사용하는 repository 묶음입니다.
 *
 * 전역 repository 묶음으로 확장하지 않고, 기능 단위 의존성만 좁게 유지합니다.
 * 이후 커밋/스냅샷/PR 기능도 각 기능에서 필요한 repository bundle 타입을 별도로 정의합니다.
 */
export interface MergeRepositoryBundle {
  mergeAnalyses: MergeAnalysisRepository;
  conflictCandidates: ConflictCandidateRepository;
  mergeProposals: MergeProposalRepository;
  proposalFeedbacks: ProposalFeedbackRepository;
  recommendationHistories?: {
    listByProject(projectId: string, limit?: number): Promise<unknown[]>;
  };
  snapshots?: {
    listByWorkspace(worktreeInstanceId: string, limit?: number): Promise<unknown[]>;
  };
  snapshotFiles?: {
    listBySnapshotId(snapshotId: string): Promise<unknown[]>;
  };
  changeRecords?: {
    listBySession(sessionId: string, limit?: number): Promise<unknown[]>;
  };
  changedFiles?: {
    listByRecordId(recordId: string): Promise<unknown[]>;
  };
}
