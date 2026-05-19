import type { GitStatusSummary } from '@gitcat/shared-types';
import { t } from '../i18n';

const STEPPER_HINT_KEY: Record<GitStatusSummary['nextAction'], string | null> = {
  RESOLVE_CONFLICTS: 'git.workflow.hint.resolveConflicts',
  ADD_CHANGES: 'git.workflow.hint.addChanges',
  COMMIT_CHANGES: 'git.workflow.hint.commitChanges',
  PULL_CHANGES: 'git.workflow.hint.pullChanges',
  PUSH_COMMITS: 'git.workflow.hint.pushCommits',
  UP_TO_DATE: null,
};

const FILE_TREE_HINT_KEY: Record<Exclude<GitStatusSummary['nextAction'], 'UP_TO_DATE'>, string> = {
  RESOLVE_CONFLICTS: 'git.workflow.fileTree.resolveConflicts',
  ADD_CHANGES: 'git.workflow.fileTree.addChanges',
  COMMIT_CHANGES: 'git.workflow.fileTree.commitChanges',
  PULL_CHANGES: 'git.workflow.fileTree.pullChanges',
  PUSH_COMMITS: 'git.workflow.fileTree.pushCommits',
};

const STEP_LABEL_KEY = {
  changes: 'git.workflow.step.changes',
  staging: 'git.workflow.step.staging',
  commit: 'git.workflow.step.commit',
  push: 'git.workflow.step.push',
} as const;

export type WorkflowStepLabelId = keyof typeof STEP_LABEL_KEY;

export function getWorkflowStepLabel(stepId: WorkflowStepLabelId): string {
  return t(STEP_LABEL_KEY[stepId]);
}

export function getWorkflowStepperHint(nextAction: GitStatusSummary['nextAction']): string | null {
  if (nextAction === 'UP_TO_DATE') {
    return null;
  }
  const key = STEPPER_HINT_KEY[nextAction];
  return key ? t(key) : null;
}

export function getFileTreeNextActionHint(
  nextAction: GitStatusSummary['nextAction'],
): string | null {
  if (nextAction === 'UP_TO_DATE') {
    return null;
  }
  return t(FILE_TREE_HINT_KEY[nextAction]);
}
