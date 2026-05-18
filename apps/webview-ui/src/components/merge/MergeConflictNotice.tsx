import React from 'react';
import { AlertTriangle, GitMerge, X, RefreshCw } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { getVsCodeWebviewApi } from '../../hooks/useVsCodeApi';

/**
 * 사이드바 전용 소형 알림 배너.
 * 병합 충돌이 감지되면 줄 하나 높이의 알림으로 표시하고,
 * "에디터에서 검토" 버튼으로 main 패널을 열 수 있게 한다.
 */
export const MergeConflictNotice: React.FC = () => {
  const conflicts = useGitCatStore((s) => s.conflicts);
  const isMergeAnalysisLoading = useGitCatStore((s) => s.isMergeAnalysisLoading);
  const isMergeProposalLoading = useGitCatStore((s) => s.isMergeProposalLoading);
  const currentAIDraft = useGitCatStore((s) => s.currentAIDraft);
  const clearMergeReviewUi = useGitCatStore((s) => s.clearMergeReviewUi);

  const isLoading = isMergeAnalysisLoading || isMergeProposalLoading;
  const visible = isLoading || conflicts.length > 0 || currentAIDraft != null;

  if (!visible) return null;

  const label = isMergeAnalysisLoading
    ? '충돌 후보 분석 중…'
    : isMergeProposalLoading
      ? 'AI 초안 생성 중…'
      : `병합 충돌 후보 ${conflicts.length}개 감지됨`;

  return (
    <div
      style={{
        margin: '0 8px 8px',
        borderRadius: 4,
        border: '1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-editorWarning-foreground))',
        background: 'var(--vscode-inputValidation-warningBackground, rgba(255,200,0,0.06))',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
        }}
      >
        {isLoading ? (
          <RefreshCw
            size={12}
            style={{
              flexShrink: 0,
              color: 'var(--vscode-editorWarning-foreground)',
              animation: 'gitcat-refresh-spin 1s linear infinite',
            }}
          />
        ) : (
          <AlertTriangle
            size={12}
            style={{ flexShrink: 0, color: 'var(--vscode-editorWarning-foreground)' }}
          />
        )}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11,
            color: 'var(--vscode-foreground)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <button
          onClick={() => getVsCodeWebviewApi()?.postMessage({ type: 'OPEN_MAIN_PANEL', payload: {} })}
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 600,
            borderRadius: 3,
            border: '1px solid var(--vscode-button-border, var(--vscode-panel-border))',
            background: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <GitMerge size={11} />
          에디터에서 검토
        </button>
        <button
          onClick={clearMergeReviewUi}
          title="닫기"
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--vscode-foreground)',
            opacity: 0.55,
            padding: 2,
            borderRadius: 2,
          }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
};
