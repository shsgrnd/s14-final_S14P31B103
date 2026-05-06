import type { BranchInfoResponse, LogEntryResponse } from '../git/GitService';

export interface CommitRecommendationRawDataOptionsDto {
  recentCommitLimit?: number;
}

export interface CommitRecommendationBranchContextDto {
  currentBranch: string;
  branchNames: string[];
  protectedBranchNames: string[];
}

export interface CommitRecommendationRawDataDto {
  stagedDiff: string;
  currentBranch: string;
  recentCommits: LogEntryResponse[];
  branchContext: CommitRecommendationBranchContextDto;
  collectedAt: string;
}

export interface CommitRecommendationCollectionFailureDto {
  step: 'status' | 'stagedDiff' | 'recentCommits' | 'branches';
  message: string;
}

export function toCommitRecommendationBranchContext(
  currentBranch: string,
  branches: BranchInfoResponse[],
): CommitRecommendationBranchContextDto {
  return {
    currentBranch,
    branchNames: branches.map((branch) => branch.name),
    protectedBranchNames: branches
      .filter((branch) => branch.status === 'protected')
      .map((branch) => branch.name),
  };
}
