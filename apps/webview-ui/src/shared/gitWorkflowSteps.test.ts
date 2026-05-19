import { describe, expect, it } from 'vitest';
import { computeWorkflowProgress, createWorkflowSummaryFixture } from './gitWorkflowSteps';

const idle = { isStaging: false, isCommitting: false, isPushing: false };

describe('computeWorkflowProgress', () => {
  it('returns null when summary is missing', () => {
    expect(computeWorkflowProgress(null, idle)).toBeNull();
  });

  it('marks changes current when unstaged files exist', () => {
    const progress = computeWorkflowProgress(
      createWorkflowSummaryFixture({
        unstagedCount: 2,
        totalChangedCount: 2,
        nextAction: 'ADD_CHANGES',
      }),
      idle,
    );
    expect(progress?.steps[0].state).toBe('current');
    expect(progress?.steps[1].state).not.toBe('done');
    expect(progress?.nextHint).toBe('다음: Git Add');
  });

  it('keeps staging current (not done) on partial stage', () => {
    const progress = computeWorkflowProgress(
      createWorkflowSummaryFixture({
        unstagedCount: 1,
        stagedCount: 1,
        totalChangedCount: 2,
        nextAction: 'ADD_CHANGES',
      }),
      idle,
    );
    expect(progress?.steps[0].state).toBe('done');
    expect(progress?.steps[1].state).toBe('current');
    expect(progress?.steps[2].state).not.toBe('done');
  });

  it('shows commit current when fully staged', () => {
    const progress = computeWorkflowProgress(
      createWorkflowSummaryFixture({
        stagedCount: 2,
        totalChangedCount: 2,
        canCommit: true,
        nextAction: 'COMMIT_CHANGES',
      }),
      idle,
    );
    expect(progress?.steps[1].state).toBe('done');
    expect(progress?.steps[2].state).toBe('current');
    expect(progress?.nextHint).toBe('다음: Git Commit');
  });

  it('shows push current after commit when can push', () => {
    const progress = computeWorkflowProgress(
      createWorkflowSummaryFixture({
        totalChangedCount: 0,
        canPush: true,
        ahead: 1,
        pushableCount: 1,
        nextAction: 'PUSH_COMMITS',
      }),
      idle,
    );
    expect(progress?.steps[2].state).toBe('done');
    expect(progress?.steps[3].state).toBe('current');
    expect(progress?.nextHint).toBe('다음: Git Push');
  });

  it('does not mark push done when only local clean with UP_TO_DATE but can still push', () => {
    const progress = computeWorkflowProgress(
      createWorkflowSummaryFixture({
        totalChangedCount: 0,
        canPush: true,
        ahead: 2,
        pushableCount: 2,
        nextAction: 'PUSH_COMMITS',
      }),
      idle,
    );
    expect(progress?.steps[3].state).not.toBe('done');
  });

  it('hides hint when up to date', () => {
    const progress = computeWorkflowProgress(
      createWorkflowSummaryFixture({ nextAction: 'UP_TO_DATE' }),
      idle,
    );
    expect(progress?.nextHint).toBeNull();
    expect(progress?.steps.every((s) => s.state === 'done')).toBe(true);
  });

  it('blocks later steps on conflict', () => {
    const progress = computeWorkflowProgress(
      createWorkflowSummaryFixture({
        hasConflicts: true,
        conflictedCount: 1,
        totalChangedCount: 1,
        nextAction: 'RESOLVE_CONFLICTS',
      }),
      idle,
    );
    expect(progress?.hasConflicts).toBe(true);
    expect(progress?.steps[0].state).toBe('current');
    expect(progress?.steps[1].state).toBe('blocked');
    expect(progress?.steps[2].state).toBe('blocked');
  });

  it('handles pull-before-push with awaitingPull', () => {
    const progress = computeWorkflowProgress(
      createWorkflowSummaryFixture({
        totalChangedCount: 0,
        behind: 2,
        canPull: true,
        nextAction: 'PULL_CHANGES',
      }),
      idle,
    );
    expect(progress?.awaitingPull).toBe(true);
    expect(progress?.steps[3].state).toBe('blocked');
    expect(progress?.nextHint).toContain('Git Pull');
  });
});
