import React, { useMemo } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import type { GitStatusSummary } from '@gitcat/shared-types';
import { computeWorkflowProgress, type WorkflowStep } from '../../shared/gitWorkflowSteps';

export interface GitWorkflowStepperProps {
  statusSummary: GitStatusSummary | null;
  isLoading?: boolean;
  isLoadingSummary?: boolean;
  isStaging?: boolean;
  isCommitting?: boolean;
  isPushing?: boolean;
}

export const GitWorkflowStepper: React.FC<GitWorkflowStepperProps> = ({
  statusSummary,
  isLoading = false,
  isLoadingSummary = false,
  isStaging = false,
  isCommitting = false,
  isPushing = false,
}) => {
  const progress = useMemo(
    () => computeWorkflowProgress(statusSummary, { isStaging, isCommitting, isPushing }),
    [statusSummary, isStaging, isCommitting, isPushing],
  );

  const showLoading = (isLoading || isLoadingSummary) && !progress;

  return (
    <div className="gitcat-workflow-stepper" style={{ margin: '0 8px 8px 8px' }}>
      {showLoading ? (
        <div
          className="gitcat-workflow-loading"
          aria-live="polite"
          style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', opacity: 0.75 }}
        >
          워크플로 상태 불러오는 중…
        </div>
      ) : progress ? (
        <>
          
            <div
              role="list"
              aria-label="Git 워크플로 진행"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '1px',
              }}
            >
              {progress.steps.map((step, index) => (
                <React.Fragment key={step.id}>
                  <StepNode
                    step={step}
                    conflict={progress.hasConflicts && step.id === 'changes'}
                    pullBlocked={progress.awaitingPull && step.id === 'push'}
                  />
                  {index < progress.steps.length - 1 && (
                    <Connector done={step.state === 'done'} muted={step.state === 'blocked'} />
                  )}
                </React.Fragment>
              ))}
            </div>
          {progress.nextHint && (
            <div
              role="status"
              style={{
                marginTop: '6px',
                fontSize: '10px',
                lineHeight: 1.35,
                color: progress.hasConflicts
                  ? 'var(--vscode-errorForeground)'
                  : progress.awaitingPull
                    ? 'var(--vscode-charts-orange, #cca700)'
                    : 'var(--vscode-descriptionForeground)',
                opacity: 0.95,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {progress.nextHint}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};

const StepNode: React.FC<{
  step: WorkflowStep;
  conflict?: boolean;
  pullBlocked?: boolean;
}> = ({ step, conflict, pullBlocked }) => {
  const isDone = step.state === 'done';
  const isCurrent = step.state === 'current';
  const isIndeterminate = step.state === 'indeterminate';
  const isBlocked = step.state === 'blocked';

  const dotColor = conflict
    ? 'var(--vscode-errorForeground)'
    : pullBlocked
      ? 'var(--vscode-charts-orange, #cca700)'
      : isDone
        ? 'var(--vscode-charts-green, #89d185)'
        : isCurrent
          ? 'var(--vscode-focusBorder)'
          : 'var(--vscode-panel-border)';

  const labelColor = conflict
    ? 'var(--vscode-errorForeground)'
    : pullBlocked
      ? 'var(--vscode-charts-orange, #cca700)'
      : isDone || isCurrent
        ? 'var(--vscode-editor-foreground)'
        : 'var(--vscode-descriptionForeground)';

  return (
    <div
      role="listitem"
      aria-current={isCurrent ? 'step' : undefined}
      aria-busy={isIndeterminate || undefined}
      style={{
        flex: '1 1 0',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '3px',
      }}
    >
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          border: `2px solid ${dotColor}`,
          background: isDone
            ? 'var(--vscode-charts-green, #89d185)'
            : isCurrent || isIndeterminate
              ? 'rgba(0, 122, 204, 0.12)'
              : isBlocked
                ? 'rgba(204, 167, 0, 0.1)'
                : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          boxSizing: 'border-box',
        }}
      >
        {conflict && !isDone && (
          <AlertTriangle size={9} strokeWidth={2.5} color="var(--vscode-errorForeground)" />
        )}
        {isDone && !conflict && (
          <Check size={9} strokeWidth={3} color="var(--vscode-editor-background, #1e1e1e)" />
        )}
        {isIndeterminate && <div className="gitcat-workflow-indeterminate-bar" />}
      </div>
      <span
        className="gitcat-workflow-step-label"
        style={{
          fontWeight: isCurrent || isDone ? 600 : 500,
          color: labelColor,
          opacity: isBlocked ? 0.55 : isDone || isCurrent || conflict || pullBlocked ? 1 : 0.72,
        }}
      >
        {step.label}
      </span>
    </div>
  );
};

const Connector: React.FC<{ done: boolean; muted?: boolean }> = ({ done, muted }) => (
  <div
    aria-hidden
    style={{
      flex: '0 0 8px',
      height: '2px',
      marginTop: '8px',
      borderRadius: '1px',
      background: done
        ? 'var(--vscode-charts-green, #89d185)'
        : 'var(--vscode-panel-border)',
      opacity: muted ? 0.35 : done ? 0.9 : 0.55,
    }}
  />
);
