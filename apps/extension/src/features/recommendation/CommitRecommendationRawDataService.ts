import { GitService } from '../git/GitService';
import {
  CommitRecommendationCollectionFailureDto,
  CommitRecommendationRawDataDto,
  CommitRecommendationRawDataOptionsDto,
  toCommitRecommendationBranchContext,
} from './CommitRecommendationDto';

const DEFAULT_RECENT_COMMIT_LIMIT = 10;

/**
 * 커밋 추천에 필요한 Git raw data만 수집합니다.
 * 실제 AI 호출과 추천 결과 저장은 다음 단계의 추천 서비스에서 연결합니다.
 */
export class CommitRecommendationRawDataService {
  constructor(private readonly gitService: GitService) {}

  public async collectRawData(
    options: CommitRecommendationRawDataOptionsDto = {},
  ): Promise<CommitRecommendationRawDataDto> {
    const status = await this.collectStatus();
    const stagedDiff = await this.collectStagedDiff();
    const recentCommits = await this.collectRecentCommits(options.recentCommitLimit);
    const branches = await this.collectBranches();

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
      return this.gitService.getLog(limit ?? DEFAULT_RECENT_COMMIT_LIMIT);
    } catch (error) {
      throw this.toCollectionError('recentCommits', error);
    }
  }

  private async collectBranches() {
    try {
      return this.gitService.getBranches();
    } catch (error) {
      throw this.toCollectionError('branches', error);
    }
  }

  private toCollectionError(
    step: CommitRecommendationCollectionFailureDto['step'],
    error: unknown,
  ): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`커밋 추천 raw data 수집 실패(${step}): ${message}`);
  }
}
