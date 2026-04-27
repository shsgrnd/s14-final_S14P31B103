import type {
  CreateProposalFeedbackInput,
  CreateRecommendationHistoryInput,
  MergeAnalysisRepository,
  ProposalFeedbackRepository,
  RecommendationHistoryRepository,
} from './repositories';
import type { MergeProposalRow, ProposalFeedbackRow, RecommendationHistoryRow } from '../dto/storage';

/**
 * 앱 설정 도메인 모델입니다.
 *
 * 글로벌 설정 저장소(globalState 등)에 직렬화되는 기본 구조이며,
 * 런타임 로직은 이 타입을 기준으로 기본값/패치를 처리합니다.
 */
export interface AppSettings {
  snapshotRetentionCount: number;
  autoDeleteMergedBranches: boolean;
  branchCleanupDays: number;
  riskFilePatterns: string[];
}

/**
 * 설정 저장소 추상화 계약입니다.
 *
 * VS Code API 의존성을 서비스 계층 밖으로 밀어내기 위해
 * get/set/delete + 앱 설정 전용 헬퍼를 함께 정의합니다.
 */
export interface SettingsStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  getAppSettings(): Promise<AppSettings>;
  patchAppSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
}

/**
 * 시크릿 저장소 추상화 계약입니다.
 *
 * 현재 MVP에서는 AI API Key 저장이 주 목적이며,
 * SecretStorage 구현체를 교체 가능하게 유지합니다.
 */
export interface SecretsStore {
  getSecret(key: string): Promise<string | undefined>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
}

/**
 * 추천 도메인 서비스 계약입니다.
 *
 * 1단계 범위에서는 "이력 저장/조회" 책임만 고정하고,
 * 실제 AI 호출 오케스트레이션은 다음 단계에서 확장합니다.
 */
export interface RecommendationServiceContract {
  saveRecommendationHistory(input: CreateRecommendationHistoryInput): Promise<RecommendationHistoryRow>;
  listRecentRecommendationHistory(
    projectId: string,
    type: RecommendationHistoryRow['recommendation_type'],
    limit?: number,
  ): Promise<RecommendationHistoryRow[]>;
}

/**
 * 병합 피드백 도메인 서비스 계약입니다.
 */
export interface MergeFeedbackServiceContract {
  saveProposalFeedback(input: CreateProposalFeedbackInput): Promise<void>;
  listProposalFeedback(projectId: string, limit?: number): Promise<ProposalFeedbackRow[]>;
  markProposalStatus(proposalId: string, status: MergeProposalRow['status']): Promise<void>;
}

/**
 * 병합 메타데이터 도메인 서비스 계약입니다.
 */
export interface MergeMetadataServiceContract {
  getMergeAnalysis(analysisId: string): ReturnType<MergeAnalysisRepository['findById']>;
  updateMergeAnalysisStatus(
    analysisId: string,
    status: Parameters<MergeAnalysisRepository['updateStatus']>[1],
  ): Promise<void>;
}

/**
 * backend2 구성 루트에서 주입받는 의존성 번들입니다.
 *
 * 팀 병렬 개발 시 구현체가 준비되는 순서와 무관하게
 * 인터페이스 단위로 조합 가능하도록 최소 묶음을 제공합니다.
 */
export interface Backend2Dependencies {
  recommendationHistoryRepository: RecommendationHistoryRepository;
  proposalFeedbackRepository: ProposalFeedbackRepository;
  mergeAnalysisRepository: MergeAnalysisRepository;
  settingsStore: SettingsStore;
  secretsStore: SecretsStore;
}
