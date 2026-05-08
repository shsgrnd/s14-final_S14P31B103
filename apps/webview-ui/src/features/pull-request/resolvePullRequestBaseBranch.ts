import type { Branch } from '@gitcat/shared-types';

const DEFAULT_BASE_BRANCH_CANDIDATES = ['main', 'master', 'develop', 'dev', 'release'];

interface ResolvePullRequestBaseBranchInput {
  branches: Branch[];
  currentBranch: string;
  selectedBaseBranch?: string;
}

/**
 * PR base 브랜치 결정
 *
 * - 사용자가 직접 고른 base가 있으면 최우선 사용
 * - 없으면 GitCat 초기 브랜치 조회 결과의 protected/local 브랜치를 우선 사용
 * - 마지막으로 흔한 기본 브랜치명(main/master/develop...) 또는 첫 local 브랜치 사용
 */
export function resolvePullRequestBaseBranch({
  branches,
  currentBranch,
  selectedBaseBranch,
}: ResolvePullRequestBaseBranchInput): string | null {
  const selected = selectedBaseBranch?.trim();
  if (selected) return selected;

  const localBranches = branches.filter((branch) => !branch.isRemote && branch.name !== currentBranch);

  const protectedBranch = localBranches.find((branch) => branch.status === 'protected');
  if (protectedBranch) return protectedBranch.name;

  const namedDefaultBranch = DEFAULT_BASE_BRANCH_CANDIDATES
    .map((name) => localBranches.find((branch) => branch.name === name))
    .find(Boolean);
  if (namedDefaultBranch) return namedDefaultBranch.name;

  return localBranches[0]?.name ?? null;
}
