import { GitService } from '../git/GitService';
import {
  CommitRecommendationCollectionFailureDto,
  CommitRecommendationRawDataDto,
  CommitRecommendationRawDataOptionsDto,
  toCommitRecommendationBranchContext,
} from './CommitRecommendationDto';

const DEFAULT_RECENT_COMMIT_LIMIT = 10;

/**
 * 커밋 추천용 Git raw data 수집 전용 서비스
 * staged diff, 현재 브랜치, 최근 커밋 로그, 브랜치 맥락 수집 담당
 */
export class CommitRecommendationRawDataService {
  constructor(private readonly gitService: GitService) {}

  public async collectRawData(
    options: CommitRecommendationRawDataOptionsDto = {},
  ): Promise<CommitRecommendationRawDataDto> {
    // 커밋 추천용 Git 정보 단계별 수집
    const status = await this.collectStatus();
    const stagedDiff = await this.collectStagedDiff();
    const recentCommits = await this.collectRecentCommits(options.recentCommitLimit);
    const branches = await this.collectBranches();

    // 추천 서비스용 raw data DTO 구성
    return {
      stagedDiff,
      currentBranch: status.currentBranch,
      recentCommits,
      branchContext: toCommitRecommendationBranchContext(status.currentBranch, branches),
      collectedAt: new Date().toISOString(),
    };
  }

  private async collectStatus() {
    try {
      // 현재 브랜치 확인용 Git status 조회
      const status = await this.gitService.getStatus();

      if (!status.currentBranch) {
        throw new Error('현재 브랜치를 확인할 수 없습니다.');
      }

      return status;
    } catch (error) {
      throw this.toCollectionError('status', error);
    }
  }

  private async collectStagedDiff(): Promise<string> {
    try {
      // 커밋 메시지 추천 대상 staged diff 수집
      const stagedDiff = await this.gitService.getStagedDiff();
      const trimmedDiff = stagedDiff.trim();

      if (!trimmedDiff) {
        throw new Error('커밋 추천에 사용할 staged diff가 없습니다.');
      }

      return trimmedDiff;
    } catch (error) {
      throw this.toCollectionError('stagedDiff', error);
    }
  }

  private async collectRecentCommits(limit?: number) {
    try {
      // 기존 커밋 메시지 스타일 참고용 최근 로그 수집
      return this.gitService.getLog(limit ?? DEFAULT_RECENT_COMMIT_LIMIT);
    } catch (error) {
      throw this.toCollectionError('recentCommits', error);
    }
  }

  private async collectBranches() {
    try {
      // 작업 맥락 및 보호 브랜치 정보 구성용 브랜치 목록 수집
      return this.gitService.getBranches();
    } catch (error) {
      throw this.toCollectionError('branches', error);
    }
  }

  private toCollectionError(
    step: CommitRecommendationCollectionFailureDto['step'],
    error: unknown,
  ): Error {
    // 수집 실패 단계 표시용 에러 변환
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`커밋 추천 raw data 수집 실패(${step}): ${message}`);
  }
}
