import type { Branch } from '@gitcat/shared-types';

const DEFAULT_BASE_BRANCH_CANDIDATES = ['main', 'master', 'develop', 'dev', 'release'];

interface ResolvePullRequestBaseBranchInput {
  branches: Branch[];
  currentBranch: string;
  selectedBaseBranch?: string;
  /**
   * 사용자가 환경설정에서 미리 지정한 기본 target 브랜치.
   * 현재 브랜치와 같거나 목록에 존재하지 않으면 무시되고 다음 우선순위로 fallback 한다.
   */
  defaultBaseBranch?: string | null;
}

/**
 * PR base 브랜치 결정
 *
 * 우선순위:
 *   1) 사용자가 PR 패널에서 직접 선택한 값 (`selectedBaseBranch`)
 *   2) 환경설정에 저장된 기본 target 브랜치 (`defaultBaseBranch`) — 단, 후보 목록에 실제로 존재해야 함
 *   3) GitCat 초기 브랜치 조회 결과의 protected 브랜치
 *   4) 흔한 기본 브랜치명(main/master/develop/dev/release) 매칭
 *   5) 첫 local 브랜치
 */
export function resolvePullRequestBaseBranch({
  branches,
  currentBranch,
  selectedBaseBranch,
  defaultBaseBranch,
}: ResolvePullRequestBaseBranchInput): string | null {
  const selected = selectedBaseBranch?.trim();
  if (selected) return selected;

  const localBranches = branches.filter((branch) => !branch.isRemote && branch.name !== currentBranch);

  const userDefault = defaultBaseBranch?.trim();
  if (userDefault) {
    const matched = localBranches.find((branch) => branch.name === userDefault);
    if (matched) return matched.name;
  }

  const protectedBranch = localBranches.find((branch) => branch.status === 'protected');
  if (protectedBranch) return protectedBranch.name;

  const namedDefaultBranch = DEFAULT_BASE_BRANCH_CANDIDATES
    .map((name) => localBranches.find((branch) => branch.name === name))
    .find(Boolean);
  if (namedDefaultBranch) return namedDefaultBranch.name;

  return localBranches[0]?.name ?? null;
}
