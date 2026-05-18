import React from 'react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { MergeConflictCandidateView } from '@gitcat/shared-types';
import { ChevronRight, CheckCircle2, XCircle, GitPullRequest, Upload, GitMerge, Download, AlertCircle } from 'lucide-react';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';

const SEVERITY_COLOR: Record<string, string> = {
  high: 'var(--vscode-charts-red, #f14c4c)',
  medium: 'var(--vscode-editorWarning-foreground, #cca700)',
  low: 'var(--vscode-charts-blue, #75beff)',
};

const ACTION_LABEL: Record<string, string> = {
  push: 'Git Push',
  pull: 'Git Pull',
  pr: 'PR 생성',
  merge: 'Merge',
};

const ACTION_RETRY_HINT: Record<string, string> = {
  push: '수락한 변경을 커밋한 뒤 원격에 Push합니다.',
  pull: '수락한 변경을 반영한 뒤 Pull을 다시 실행합니다.',
  merge: '수락한 변경을 반영한 뒤 Merge를 계속합니다.',
  pr: '수락한 변경을 커밋·푸시한 뒤 PR 생성 단계로 이어집니다.',
};

const ACTION_INBOUND: Record<string, string> = {
  push: 'GIT_PUSH',
  pull: 'EXECUTE_PULL',
  pr: 'OPEN_PULL_REQUEST_PANEL',
  merge: 'RUN_MERGE',
};

export const ConflictAnalysisView: React.FC = () => {
  const {
    conflicts, isAnalyzing, isMergeAnalysisLoading,
    selectedConflict, setSelectedConflict,
    getCandidateResolvedStatus, pendingGitAction, clearResolvedCandidates,
    isPulling, isPushing, isMerging, globalNotification,
    pendingMergeSource,
  } = useGitCatStore();
  const isPrPushRetrying = pendingGitAction === 'pr' && isPushing;
  const { sendMessage } = useVsCodeApi();
  const analyzing = isAnalyzing || isMergeAnalysisLoading;

  const totalCount = conflicts.length;
  const resolvedCount = conflicts.filter((c) => getCandidateResolvedStatus(c) != null).length;
  const allResolved = totalCount > 0 && resolvedCount >= totalCount;

  const handleFocusConflict = (conflict: MergeConflictCandidateView) => {
    setSelectedConflict(conflict);
  };

  // 현재 retry 작업 실행 중 여부
  const isRetrying =
    (pendingGitAction === 'pull' && isPulling) ||
    (pendingGitAction === 'push' && isPushing) ||
    (pendingGitAction === 'merge' && isMerging);

  // 에디터 패널에는 globalNotification이 렌더링되지 않으므로 여기서 직접 표시
  const retryError =
    globalNotification?.type === 'error' ? globalNotification.message : null;

  const handleContinueAction = () => {
    if (!pendingGitAction || isRetrying) return;
    // UI는 그대로 유지 — pull/push/merge 성공 알림이 오면 스토어에서 자동으로 정리됨
    const msgType = ACTION_INBOUND[pendingGitAction];
    if (msgType) {
      if (pendingGitAction === 'merge' && pendingMergeSource) {
        // merge 재시도: source 브랜치 정보 포함 필요
        (sendMessage as any)(msgType, { source: pendingMergeSource, skipGuard: true });
      } else {
        // skipGuard: true → 충돌 가드를 건너뛰고 Git 작업 바로 실행
        (sendMessage as any)(msgType, { skipGuard: true });
      }
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--vscode-sideBar-background)',
      borderTop: '1px solid var(--vscode-panel-border)',
      overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        flexShrink: 0,
        padding: '6px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-sideBarSectionHeader-background)',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          opacity: 0.8, color: 'var(--vscode-foreground)',
        }}>
          병합 위험 분석
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {totalCount > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: allResolved
                ? 'var(--vscode-charts-green, #89d185)'
                : 'var(--vscode-descriptionForeground)',
            }}>
              {resolvedCount}/{totalCount} 처리됨
            </span>
          )}
          {analyzing && (
            <div style={{
              width: 12, height: 12,
              border: '2px solid color-mix(in srgb, var(--vscode-focusBorder) 30%, transparent)',
              borderTopColor: 'var(--vscode-focusBorder)',
              borderRadius: '50%',
              animation: 'gitcat-refresh-spin 0.75s linear infinite',
            }} />
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!analyzing && conflicts.length === 0 ? (
          <div style={{
            padding: '20px 16px', textAlign: 'center',
            fontSize: 11, opacity: 0.45, color: 'var(--vscode-foreground)',
          }}>
            분석된 충돌 위험 구간이 없습니다.
          </div>
        ) : (
          conflicts.map((conflict, idx) => (
            <ConflictItem
              key={`${conflict.filePath}-${idx}`}
              conflict={conflict}
              isSelected={selectedConflict?.candidateId === conflict.candidateId}
              resolvedStatus={getCandidateResolvedStatus(conflict)}
              onClick={() => handleFocusConflict(conflict)}
            />
          ))
        )}
      </div>

      {/* 전체 해결 후 계속하기 패널 */}
      {allResolved && (
        <div style={{
          flexShrink: 0,
          padding: '12px 14px',
          borderTop: '1px solid var(--vscode-panel-border)',
          background: 'color-mix(in srgb, var(--vscode-charts-green, #89d185) 6%, var(--vscode-editor-background))',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} style={{ color: 'var(--vscode-charts-green, #89d185)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--vscode-charts-green, #89d185)' }}>
              모든 충돌 후보 처리 완료
            </span>
          </div>
          <p style={{
            fontSize: 10, margin: 0, lineHeight: 1.5,
            color: 'var(--vscode-foreground)', opacity: 0.75,
          }}>
            {pendingGitAction
              ? `${ACTION_RETRY_HINT[pendingGitAction]} (${ACTION_LABEL[pendingGitAction]})`
              : 'add → commit → push 순서로 변경 사항을 원격에 반영하세요.'}
          </p>

          {/* 에러 배너 (에디터 패널에는 globalNotification이 없으므로 여기서 표시) */}
          {retryError && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 7,
              padding: '7px 10px', borderRadius: 4,
              background: 'color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 10%, var(--vscode-editor-background))',
              border: '1px solid color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 40%, transparent)',
            }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--vscode-charts-red, #f14c4c)' }} />
              <span style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--vscode-foreground)' }}>
                {retryError}
              </span>
            </div>
          )}

          {pendingGitAction && pendingGitAction !== 'pr' && (
            <button
              onClick={handleContinueAction}
              disabled={isRetrying}
              className="gitcat-ai-btn"
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 4, border: 'none',
                background: isRetrying ? 'var(--vscode-button-secondaryBackground)' : 'var(--vscode-button-background)',
                color: isRetrying ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-button-foreground)',
                fontSize: 11, fontWeight: 700,
                cursor: isRetrying ? 'not-allowed' : 'pointer',
                opacity: isRetrying ? 0.8 : 1,
                boxShadow: isRetrying ? 'none' : '0 1px 3px rgba(0,0,0,0.18)',
              }}
            >
              {isRetrying ? (
                <>
                  <div style={{
                    width: 12, height: 12, flexShrink: 0,
                    border: '2px solid color-mix(in srgb, currentColor 30%, transparent)',
                    borderTopColor: 'currentColor', borderRadius: '50%',
                    animation: 'gitcat-refresh-spin 0.75s linear infinite',
                  }} />
                  {ACTION_LABEL[pendingGitAction]} 실행 중…
                </>
              ) : (
                <>
                  {pendingGitAction === 'push' && <Upload size={13} />}
                  {pendingGitAction === 'pull' && <Download size={13} />}
                  {pendingGitAction === 'merge' && <GitMerge size={13} />}
                  {ACTION_LABEL[pendingGitAction]} 다시 시도
                </>
              )}
            </button>
          )}
          {pendingGitAction === 'pr' && (
            <>
              <p style={{ fontSize: 10, margin: 0, lineHeight: 1.5, color: 'var(--vscode-foreground)', opacity: 0.7 }}>
                수락한 변경사항을 커밋하고 원격에 푸시한 후 PR을 생성합니다.
              </p>
              <button
                onClick={() => (sendMessage as any)('GIT_PUSH', { skipGuard: true })}
                disabled={isPrPushRetrying}
                className="gitcat-ai-btn"
                style={{
                  alignSelf: 'flex-start',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 4, border: 'none',
                  background: isPrPushRetrying ? 'var(--vscode-button-secondaryBackground)' : 'var(--vscode-button-background)',
                  color: isPrPushRetrying ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-button-foreground)',
                  fontSize: 11, fontWeight: 700,
                  cursor: isPrPushRetrying ? 'not-allowed' : 'pointer',
                  opacity: isPrPushRetrying ? 0.8 : 1,
                  boxShadow: isPrPushRetrying ? 'none' : '0 1px 3px rgba(0,0,0,0.18)',
                }}
              >
                {isPrPushRetrying ? (
                  <>
                    <div style={{
                      width: 12, height: 12, flexShrink: 0,
                      border: '2px solid color-mix(in srgb, currentColor 30%, transparent)',
                      borderTopColor: 'currentColor', borderRadius: '50%',
                      animation: 'gitcat-refresh-spin 0.75s linear infinite',
                    }} />
                    커밋 & 푸시 중…
                  </>
                ) : (
                  <>
                    <Upload size={13} />
                    커밋 & 푸시 후 PR 생성
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const ConflictItem: React.FC<{
  conflict: MergeConflictCandidateView;
  isSelected?: boolean;
  resolvedStatus?: 'accepted' | 'rejected';
  onClick: () => void;
}> = ({ conflict, isSelected, resolvedStatus, onClick }) => {
  const [hovered, setHovered] = React.useState(false);

  const isAccepted = resolvedStatus === 'accepted';
  const isRejected = resolvedStatus === 'rejected';
  const isResolved = isAccepted || isRejected;

  const resolvedBg = isAccepted
    ? 'color-mix(in srgb, var(--vscode-charts-green, #89d185) 8%, transparent)'
    : isRejected
      ? 'color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 5%, transparent)'
      : 'transparent';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--vscode-panel-border)',
        cursor: 'pointer',
        background: isSelected
          ? 'var(--vscode-list-activeSelectionBackground)'
          : hovered
            ? 'var(--vscode-list-hoverBackground)'
            : resolvedBg,
        borderLeft: isSelected
          ? '2px solid var(--vscode-focusBorder)'
          : isAccepted
            ? '2px solid var(--vscode-charts-green, #89d185)'
            : isRejected
              ? '2px solid color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 60%, transparent)'
              : '2px solid transparent',
        userSelect: 'none',
        outline: 'none',
        opacity: isResolved ? 0.75 : 1,
        transition: 'opacity 0.2s, background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: isResolved ? 2 : 3 }}>
        {/* 상태 아이콘 */}
        {isAccepted ? (
          <CheckCircle2 size={13} style={{ flexShrink: 0, color: 'var(--vscode-charts-green, #89d185)' }} />
        ) : isRejected ? (
          <XCircle size={13} style={{ flexShrink: 0, color: 'color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 70%, var(--vscode-foreground))' }} />
        ) : (
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: SEVERITY_COLOR[conflict.severity] ?? 'var(--vscode-charts-blue)',
            display: 'inline-block',
          }} />
        )}

        <span style={{
          flex: 1, minWidth: 0,
          fontSize: 11, fontWeight: 600,
          color: 'var(--vscode-foreground)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          textDecoration: isRejected ? 'line-through' : 'none',
          opacity: isRejected ? 0.6 : 1,
        }}>
          {conflict.filePath.split('/').pop()}
        </span>

        {/* 처리 상태 배지 */}
        {isAccepted && (
          <span style={{
            flexShrink: 0, fontSize: 9, fontWeight: 700,
            padding: '1px 5px', borderRadius: 8,
            background: 'color-mix(in srgb, var(--vscode-charts-green, #89d185) 18%, transparent)',
            color: 'var(--vscode-charts-green, #89d185)',
            letterSpacing: '0.04em',
          }}>
            반영 완료
          </span>
        )}
        {isRejected && (
          <span style={{
            flexShrink: 0, fontSize: 9, fontWeight: 700,
            padding: '1px 5px', borderRadius: 8,
            background: 'color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 12%, transparent)',
            color: 'color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 80%, var(--vscode-foreground))',
            letterSpacing: '0.04em',
          }}>
            반영 안 함
          </span>
        )}

        {!isResolved && (
          <>
            <span style={{ fontSize: 10, opacity: 0.5, flexShrink: 0 }}>L{conflict.lineStart}</span>
            <ChevronRight size={12} style={{
              flexShrink: 0, opacity: hovered ? 0.85 : 0.35,
              color: 'var(--vscode-foreground)',
            }} />
          </>
        )}
      </div>

      {!isResolved && conflict.reason && (
        <p style={{
          margin: '0 0 3px 13px',
          fontSize: 10, lineHeight: 1.5, opacity: 0.65,
          color: 'var(--vscode-foreground)',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        } as React.CSSProperties}>
          {conflict.reason}
        </p>
      )}

      {!isResolved && conflict.suggestion && (
        <div style={{
          marginTop: 4, marginLeft: 13,
          padding: '4px 8px', borderRadius: 3,
          background: 'var(--vscode-editor-inactiveSelectionBackground)',
          borderLeft: '2px solid var(--vscode-charts-blue, #75beff)',
        }}>
          <p style={{ fontSize: 10, color: 'var(--vscode-textLink-foreground)', fontWeight: 700, margin: '0 0 2px 0' }}>
            💡 AI 제안
          </p>
          <p style={{
            fontSize: 10, margin: 0, opacity: 0.75, fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {conflict.suggestion}
          </p>
        </div>
      )}
    </div>
  );
};
