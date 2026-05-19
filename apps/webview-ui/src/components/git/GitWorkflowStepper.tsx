import React, { useMemo } from 'react';
import { AlertTriangle, Check, ChevronRight } from 'lucide-react';
import type { GitStatusSummary } from '@gitcat/shared-types';
import { getLocale, t } from '../../i18n';
import { computeWorkflowProgress, type WorkflowStep } from '../../shared/gitWorkflowSteps';

export interface GitWorkflowStepperProps {
  statusSummary: GitStatusSummary | null;
  isLoading?: boolean;
  isLoadingSummary?: boolean;
  isStaging?: boolean;
  isCommitting?: boolean;
  isPushing?: boolean;
}

const WORKFLOW_GRID_COLUMNS = '13px 1fr 13px 1fr 13px 1fr 13px';

export const GitWorkflowStepper: React.FC<GitWorkflowStepperProps> = ({
  statusSummary,
  isLoading = false,
  isLoadingSummary = false,
  isStaging = false,
  isCommitting = false,
  isPushing = false,
}) => {
  const locale = getLocale();
  const progress = useMemo(
    () => computeWorkflowProgress(statusSummary, { isStaging, isCommitting, isPushing }),
    [statusSummary, isStaging, isCommitting, isPushing, locale],
  );

  const showLoading = (isLoading || isLoadingSummary) && !progress;

  return (
    <div className="gitcat-workflow-stepper">
      {showLoading ? (
        <div className="gitcat-workflow-loading" aria-live="polite">
          {t('git.workflow.loading')}
        </div>
      ) : progress ? (
        <>
          <div
            className="gitcat-workflow-track"
            role="list"
            aria-label="Git 워크플로 진행"
            style={{ gridTemplateColumns: WORKFLOW_GRID_COLUMNS }}
          >
            {progress.steps.map((step, index) => {
              const dotCol = index * 2 + 1;
              const connCol = index * 2 + 2;
              const nextStep = index < progress.steps.length - 1 ? progress.steps[index + 1] : null;

              return (
                <React.Fragment key={step.id}>
                  <div
                    className="gitcat-workflow-step-node"
                    role="listitem"
                    style={{ gridColumn: dotCol, gridRow: 1 }}
                    aria-current={step.state === 'current' ? 'step' : undefined}
                    aria-busy={step.state === 'indeterminate' || undefined}
                  >
                    <StepDot
                      step={step}
                      conflict={progress.hasConflicts && step.id === 'changes'}
                      pullBlocked={progress.awaitingPull && step.id === 'push'}
                    />
                  </div>
                  <span
                    className={`gitcat-workflow-step-label${step.state === 'current' || step.state === 'done' ? ' gitcat-workflow-step-label--active' : ''}`}
                    style={{
                      gridColumn: dotCol,
                      gridRow: 2,
                      color:
                        progress.hasConflicts && step.id === 'changes'
                          ? 'var(--vscode-errorForeground)'
                          : progress.awaitingPull && step.id === 'push'
                            ? 'var(--vscode-charts-orange, #cca700)'
                            : step.state === 'done' || step.state === 'current'
                              ? 'var(--vscode-editor-foreground)'
                              : 'var(--vscode-descriptionForeground)',
                      opacity:
                        step.state === 'blocked'
                          ? 0.5
                          : step.state === 'done' || step.state === 'current'
                            ? 1
                            : 0.7,
                    }}
                  >
                    {step.label}
                  </span>
                  {index < progress.steps.length - 1 && (
                    <Connector
                      style={{ gridColumn: connCol, gridRow: 1 }}
                      done={step.state === 'done' && nextStep?.state === 'done'}
                      muted={
                        step.state === 'blocked' ||
                        nextStep?.state === 'blocked' ||
                        (progress.hasConflicts &&
                          (step.id === 'changes' || nextStep?.id === 'changes'))
                      }
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          {progress.nextHint && (
            <div
              role="status"
              className={`gitcat-workflow-hint${
                progress.hasConflicts
                  ? ' gitcat-workflow-hint--error'
                  : progress.awaitingPull
                    ? ' gitcat-workflow-hint--pull'
                    : ''
              }`}
            >
              {progress.nextHint}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};

const StepDot: React.FC<{
  step: WorkflowStep;
  conflict?: boolean;
  pullBlocked?: boolean;
}> = ({ step, conflict, pullBlocked }) => {
  const isDone = step.state === 'done';
  const isCurrent = step.state === 'current';
  const isIndeterminate = step.state === 'indeterminate';
  const isBlocked = step.state === 'blocked';

  const dotStyle: React.CSSProperties = {
    borderColor: conflict
      ? 'var(--vscode-errorForeground)'
      : pullBlocked
        ? 'var(--vscode-charts-orange, #cca700)'
        : isDone
          ? 'var(--vscode-charts-green, #89d185)'
          : isCurrent
            ? 'var(--vscode-focusBorder)'
            : 'var(--vscode-panel-border)',
    background: isDone
      ? 'var(--vscode-charts-green, #89d185)'
      : isCurrent || isIndeterminate
        ? 'rgba(0, 122, 204, 0.1)'
        : isBlocked
          ? 'rgba(204, 167, 0, 0.08)'
          : 'transparent',
  };

  return (
    <div
      className={`gitcat-workflow-dot${isIndeterminate ? ' gitcat-workflow-dot--spinning' : ''}`}
      style={isIndeterminate ? { ...dotStyle, borderColor: 'transparent' } : dotStyle}
    >
      {isIndeterminate && <span className="gitcat-workflow-dot-ring" aria-hidden />}
      {conflict && !isDone && !isIndeterminate && (
        <AlertTriangle size={8} strokeWidth={2.5} color="var(--vscode-errorForeground)" />
      )}
      {isDone && !conflict && (
        <Check size={8} strokeWidth={3} color="var(--vscode-editor-background, #1e1e1e)" />
      )}
    </div>
  );
};

const Connector: React.FC<{
  done: boolean;
  muted?: boolean;
  style?: React.CSSProperties;
}> = ({ done, muted, style }) => (
  <div
    aria-hidden
    style={style}
    className={`gitcat-workflow-connector${done ? ' gitcat-workflow-connector--done' : ''}${
      muted ? ' gitcat-workflow-connector--muted' : ''
    }`}
  >
    <span className="gitcat-workflow-connector-arrow">
      <ChevronRight size={12} strokeWidth={2.75} aria-hidden />
    </span>
  </div>
);
