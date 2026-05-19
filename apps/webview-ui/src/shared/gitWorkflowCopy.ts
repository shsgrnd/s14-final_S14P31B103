import type { GitStatusSummary } from '@gitcat/shared-types';

/** Git & AI 스텝퍼 하단 한 줄 */
export const GIT_NEXT_ACTION_STEPPER_HINT: Record<GitStatusSummary['nextAction'], string | null> = {
  RESOLVE_CONFLICTS: '충돌 해결이 필요합니다',
  ADD_CHANGES: '다음: Git Add',
  COMMIT_CHANGES: '다음: Git Commit',
  PULL_CHANGES: '다음: Git Pull (원격 동기화)',
  PUSH_COMMITS: '다음: Git Push',
  UP_TO_DATE: '이 브랜치는 최신 상태입니다',
};

/** Files 패널 다음 액션 배너 */
export const GIT_NEXT_ACTION_FILE_TREE_HINT: Record<
  Exclude<GitStatusSummary['nextAction'], 'UP_TO_DATE'>,
  string
> = {
  RESOLVE_CONFLICTS: '충돌 해결이 필요합니다',
  ADD_CHANGES: '변경사항을 스테이징하세요',
  COMMIT_CHANGES: '커밋할 준비가 됐습니다',
  PULL_CHANGES: '원격 변경사항을 Pull하세요',
  PUSH_COMMITS: 'Push할 커밋이 있습니다',
};

export function getWorkflowStepperHint(nextAction: GitStatusSummary['nextAction']): string | null {
  if (nextAction === 'UP_TO_DATE') {
    return null;
  }
  return GIT_NEXT_ACTION_STEPPER_HINT[nextAction] ?? null;
}

export function getFileTreeNextActionHint(
  nextAction: GitStatusSummary['nextAction'],
): string | null {
  if (nextAction === 'UP_TO_DATE') {
    return null;
  }
  return GIT_NEXT_ACTION_FILE_TREE_HINT[nextAction] ?? null;
}
