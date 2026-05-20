import type { GitStatusSummary } from '@gitcat/shared-types';
import { getWorkflowStepLabel, getWorkflowStepperHint } from './gitWorkflowCopy';

export type WorkflowStepId = 'changes' | 'staging' | 'commit' | 'push';

export type WorkflowStepState = 'pending' | 'current' | 'done' | 'indeterminate' | 'blocked';

export interface WorkflowStep {
  id: WorkflowStepId;
  label: string;
  state: WorkflowStepState;
}

export interface WorkflowProgress {
  steps: WorkflowStep[];
  nextHint: string | null;
  hasConflicts: boolean;
  /** 원격 Pull이 필요해 Push 단계와 분리된 동기화 구간 */
  awaitingPull: boolean;
}

/** extension nextAction → 스텝퍼 현재 단계 (단일 출처) */
const NEXT_ACTION_CURRENT_STEP: Record<GitStatusSummary['nextAction'], number> = {
  RESOLVE_CONFLICTS: 0,
  ADD_CHANGES: 0,
  COMMIT_CHANGES: 2,
  PUSH_COMMITS: 3,
  PULL_CHANGES: -1,
  UP_TO_DATE: -1,
};

function resolveCurrentStepIndex(input: {
  nextAction: GitStatusSummary['nextAction'];
  hasConflicts: boolean;
  needsStage: boolean;
  hasStaged: boolean;
}): number {
  if (input.hasConflicts) {
    return 0;
  }

  let currentIdx = NEXT_ACTION_CURRENT_STEP[input.nextAction];

  if (input.nextAction === 'ADD_CHANGES') {
    // 다음 액션이 Git Add → 스테이징 단계가 current, 변경은 감지 완료(done)
    if (input.needsStage) {
      currentIdx = 1;
    } else if (input.hasStaged) {
      currentIdx = 2;
    } else {
      currentIdx = 0;
    }
  }

  return currentIdx;
}

function resolveStepState(
  idx: number,
  currentIdx: number,
  done: boolean,
  indeterminate: boolean,
  hasConflicts: boolean,
  awaitingPull: boolean,
): WorkflowStepState {
  if (hasConflicts) {
    if (idx === 0) {
      return indeterminate ? 'indeterminate' : 'current';
    }
    return 'blocked';
  }

  if (awaitingPull && idx === 3) {
    return 'blocked';
  }

  if (indeterminate) {
    return 'indeterminate';
  }
  if (currentIdx >= 0 && idx === currentIdx) {
    return 'current';
  }
  if (done) {
    return 'done';
  }
  if (currentIdx >= 0 && idx < currentIdx) {
    return 'done';
  }
  return 'pending';
}

/**
 * 스텝 체크 = 마일스톤 도달 / 현재 단계 = extension nextAction 기준.
 */
export function computeWorkflowProgress(
  summary: GitStatusSummary | null,
  flags: { isStaging: boolean; isCommitting: boolean; isPushing: boolean },
): WorkflowProgress | null {
  if (!summary) return null;

  const {
    unstagedCount,
    untrackedCount,
    stagedCount,
    totalChangedCount,
    hasConflicts,
    canPush,
    pushableCount,
    nextAction,
  } = summary;

  const needsStage = unstagedCount + untrackedCount > 0;
  const hasStaged = stagedCount > 0;
  const hasChanges = totalChangedCount > 0;
  const localClean = totalChangedCount === 0 && !hasConflicts;
  const needsPush = canPush || nextAction === 'PUSH_COMMITS' || pushableCount > 0;
  const awaitingPull = !hasConflicts && nextAction === 'PULL_CHANGES' && localClean;

  const currentIdx = resolveCurrentStepIndex({
    nextAction,
    hasConflicts,
    needsStage,
    hasStaged,
  });

  const doneFlags = hasConflicts
    ? [false, false, false, false]
    : [
        hasChanges || localClean,
        (hasStaged && !needsStage) || localClean,
        localClean,
        localClean && !needsPush && !awaitingPull && nextAction === 'UP_TO_DATE',
      ];

  const indeterminateAt: Partial<Record<number, boolean>> = {
    1: flags.isStaging,
    2: flags.isCommitting,
    3: flags.isPushing,
  };

  const steps: WorkflowStep[] = (['changes', 'staging', 'commit', 'push'] as WorkflowStepId[]).map((id, idx) => ({
    id,
    label: getWorkflowStepLabel(id),
    state: resolveStepState(
      idx,
      currentIdx,
      doneFlags[idx],
      !!indeterminateAt[idx],
      hasConflicts,
      awaitingPull,
    ),
  }));

  return {
    steps,
    nextHint: getWorkflowStepperHint(nextAction),
    hasConflicts,
    awaitingPull,
  };
}

/** @internal 테스트용 요약 객체 생성 */
export function createWorkflowSummaryFixture(
  overrides: Partial<GitStatusSummary> = {},
): GitStatusSummary {
  return {
    branch: 'main',
    ahead: 0,
    behind: 0,
    unstagedCount: 0,
    stagedCount: 0,
    pushableCount: 0,
    untrackedCount: 0,
    conflictedCount: 0,
    totalChangedCount: 0,
    canCommit: false,
    canPush: false,
    canPull: false,
    hasConflicts: false,
    nextAction: 'UP_TO_DATE',
    unstaged: [],
    staged: [],
    pushable: [],
    untracked: [],
    conflicted: [],
    ...overrides,
  };
}
