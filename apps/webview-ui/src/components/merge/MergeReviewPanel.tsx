import React from 'react';
import { X, Info } from 'lucide-react';
import { AIDraftPanel } from './AIDraftPanel';
import { ConflictAnalysisView } from './ConflictAnalysisView';
import { useGitCatStore } from '../../store/useGitCatStore';

type MergeReviewVariant = 'sidebar' | 'main' | 'pr';

const SECTION_MIN_MERGE = 120;

export interface MergeReviewPanelProps {
  /** sidebar·PR: 세로 스택 + 높이 제한. main: 기존 메인 패널 비율 */
  variant?: MergeReviewVariant;
  /** true면 병합 데이터가 없어도 패널 자리를 유지(메인 탭 ‘AI 병합 중재안’ 대기 화면) */
  showWhenIdle?: boolean;
}

/**
 * 병합 충돌 후보 → AI 초안 → 수락/거절까지 한 블록으로 묶는 패널.
 * 사이드바·PR 패널·메인 패널에서 공통으로 사용한다.
 */
export const MergeReviewPanel: React.FC<MergeReviewPanelProps> = ({ variant = 'sidebar', showWhenIdle }) => {
  const conflicts = useGitCatStore((s) => s.conflicts);
  const currentAIDraft = useGitCatStore((s) => s.currentAIDraft);
  const mergeApplyFollowupHint = useGitCatStore((s) => s.mergeApplyFollowupHint);
  const isMergeAnalysisLoading = useGitCatStore((s) => s.isMergeAnalysisLoading);
  const isMergeProposalLoading = useGitCatStore((s) => s.isMergeProposalLoading);
  const clearMergeApplyHint = useGitCatStore((s) => s.clearMergeApplyHint);
  const clearMergeReviewUi = useGitCatStore((s) => s.clearMergeReviewUi);

  const visible =
    !!showWhenIdle ||
    conflicts.length > 0 ||
    currentAIDraft != null ||
    mergeApplyFollowupHint != null ||
    isMergeAnalysisLoading ||
    isMergeProposalLoading;

  if (!visible) {
    return null;
  }

  const showInfoBanner =
    mergeApplyFollowupHint ||
    conflicts.length > 0 ||
    currentAIDraft != null ||
    isMergeAnalysisLoading ||
    isMergeProposalLoading;
  const isMain = variant === 'main';
  const outerStyle: React.CSSProperties = isMain
    ? { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }
    : {
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
        maxHeight: variant === 'pr' ? 'min(72vh, 820px)' : 'min(55vh, 560px)',
        borderTop: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-editor-background)',
        color: 'var(--vscode-editor-foreground)',
      };

  return (
    <div style={outerStyle}>
      {showInfoBanner && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '8px 10px',
            fontSize: 11,
            lineHeight: 1.45,
            borderBottom: '1px solid var(--vscode-panel-border)',
            background: 'var(--vscode-editor-inactiveSelectionBackground)',
          }}
        >
          <Info size={14} style={{ flexShrink: 0, marginTop: 2, opacity: 0.85 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {isMergeProposalLoading ? (
              <span>AI 병합 초안을 생성하는 중입니다…</span>
            ) : isMergeAnalysisLoading ? (
              <span>충돌 후보를 분석하는 중입니다…</span>
            ) : mergeApplyFollowupHint ? (
              <span>{mergeApplyFollowupHint}</span>
            ) : (
              <span>
                Push·Pull·PR 생성 전에 막힌 병합 충돌 가능 구간입니다. 후보를 선택해 AI 초안을 받은 뒤 수락하면 로컬 파일만
                바뀝니다. 이어서 스테이징 → 커밋 → 푸시로 원격에 반영하세요.
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexShrink: 0, gap: 4, alignItems: 'center' }}>
            {mergeApplyFollowupHint && (
              <button
                type="button"
                title="안내 닫기"
                aria-label="안내 닫기"
                onClick={() => clearMergeApplyHint()}
                className="gitcat-icon-press"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--vscode-foreground)',
                  cursor: 'pointer',
                  padding: 2,
                  borderRadius: 4,
                  display: 'flex',
                }}
              >
                <X size={14} />
              </button>
            )}
            {!isMergeAnalysisLoading &&
              !isMergeProposalLoading &&
              (conflicts.length > 0 || mergeApplyFollowupHint || currentAIDraft) && (
              <button
                type="button"
                onClick={() => clearMergeReviewUi()}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: '1px solid var(--vscode-panel-border)',
                  background: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                검토 닫기
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: isMain ? '1 1 0' : '1 1 45%', minHeight: isMain ? 0 : 120, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <AIDraftPanel />
        </div>
        <div
          style={{
            flex: isMain ? '0 0 33%' : '0 1 40%',
            minHeight: isMain ? SECTION_MIN_MERGE : 100,
            maxHeight: isMain ? '38%' : undefined,
            borderTop: '1px solid var(--vscode-panel-border)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ConflictAnalysisView />
        </div>
      </div>
    </div>
  );
};
