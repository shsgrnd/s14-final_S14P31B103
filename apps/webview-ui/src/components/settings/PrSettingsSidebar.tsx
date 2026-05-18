import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, GitBranch, GitPullRequest, ShieldCheck, X } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useDefaultPrBaseBranch } from '../../hooks/useDefaultPrBaseBranch';
import { vscodeSidebarViewTitleForeground, webviewBodyForeground, webviewDescriptionForeground } from '../../shared/styles';

export interface PrSettingsSidebarProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 사이드바 푸터의 환경설정(톱니) 아이콘에서 열리는 드로워.
 *
 * - 사이드바 내부에 슬라이드인되어 표시되며, 모달처럼 화면 중앙을 덮지 않는다.
 * - 현재 항목: "PR 기본 target 브랜치"
 *   · 아코디언 헤더 클릭으로 로컬 브랜치 목록을 펼치고, 하나를 선택해 저장한다.
 *   · 저장 결과는 `prSettingsWebviewStorage`에 영속되고, 다음에 Create PR 패널을 열 때
 *     `resolvePullRequestBaseBranch`가 자동으로 이 값을 base 브랜치로 채워준다.
 */
export const PrSettingsSidebar: React.FC<PrSettingsSidebarProps> = ({ open, onClose }) => {
  const branches = useGitCatStore((s) => s.branches);
  const currentBranch = useGitCatStore((s) => s.currentBranch);
  const { defaultBranch, setDefaultBranch, clearDefaultBranch } = useDefaultPrBaseBranch();

  const [isBranchListOpen, setIsBranchListOpen] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setIsBranchListOpen(false);
      setSavedToast(null);
    }
  }, [open]);

  const localBranches = useMemo(
    () => branches.filter((b) => !b.isRemote && b.name !== currentBranch),
    [branches, currentBranch],
  );

  const defaultBranchStillExists = useMemo(
    () => (defaultBranch ? localBranches.some((b) => b.name === defaultBranch) : true),
    [defaultBranch, localBranches],
  );

  const handlePick = (name: string) => {
    setDefaultBranch(name);
    setIsBranchListOpen(false);
    setSavedToast(`기본 target 브랜치를 "${name}"으로 설정했습니다.`);
  };

  const handleClear = () => {
    clearDefaultBranch();
    setSavedToast('기본 target 브랜치 설정을 해제했습니다.');
  };

  return (
    <div
      aria-hidden={!open}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: open ? 'auto' : 'none',
        zIndex: 50,
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.32)',
          opacity: open ? 1 : 0,
          transition: 'opacity 0.18s ease',
        }}
      />

      <aside
        role="dialog"
        aria-modal="false"
        aria-label="GitCat 환경설정"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: '100%',
          maxWidth: '100%',
          background: 'var(--vscode-sideBar-background)',
          color: webviewBodyForeground,
          borderLeft: '1px solid var(--vscode-panel-border)',
          boxShadow: '-6px 0 20px rgba(0,0,0,0.32)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.22s ease',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '10px 12px',
            borderBottom: '1px solid var(--vscode-panel-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <GitPullRequest size={15} style={{ color: 'var(--vscode-charts-blue)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: vscodeSidebarViewTitleForeground }}>환경설정</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="닫기 (Esc)"
            aria-label="환경설정 닫기"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              borderRadius: 4,
              cursor: 'pointer',
              color: vscodeSidebarViewTitleForeground,
              opacity: 0.88,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={15} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px 18px 12px' }}>
          <section>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 4,
                color: vscodeSidebarViewTitleForeground,
              }}
            >
              <GitPullRequest size={13} style={{ color: 'var(--vscode-charts-blue)' }} />
              PR 기본 target 브랜치
            </div>
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: 11,
                lineHeight: 1.55,
                color: webviewDescriptionForeground,
                opacity: 0.92,
              }}
            >
              Create Pull Request 패널을 열 때 자동으로 채워질 base 브랜치를 지정합니다.
              현재 브랜치 목록에 그 브랜치가 없으면 기존 자동 추론(보호 브랜치 → main/master 등) 으로 자연스럽게 fallback 됩니다.
            </p>

            <div
              onClick={() => setIsBranchListOpen((v) => !v)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsBranchListOpen((v) => !v);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: isBranchListOpen ? '4px 4px 0 0' : '4px',
                border: '1px solid var(--vscode-panel-border)',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)')}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--vscode-panel-border)')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', minWidth: 0 }}>
                <GitBranch size={14} style={{ color: 'var(--vscode-charts-blue)', flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: defaultBranch
                      ? defaultBranchStillExists
                        ? 'var(--vscode-input-foreground)'
                        : 'var(--vscode-editorWarning-foreground)'
                      : 'var(--vscode-input-foreground)',
                    opacity: defaultBranch ? 1 : 0.82,
                  }}
                >
                  {defaultBranch ?? '지정되지 않음 (자동 추론 사용)'}
                </span>
              </div>
              {isBranchListOpen ? (
                <ChevronUp size={14} style={{ color: 'var(--vscode-input-foreground)', opacity: 0.88 }} />
              ) : (
                <ChevronDown size={14} style={{ color: 'var(--vscode-input-foreground)', opacity: 0.88 }} />
              )}
            </div>

            <div
              style={{
                border: '1px solid var(--vscode-panel-border)',
                borderTop: 'none',
                borderRadius: '0 0 4px 4px',
                overflowY: 'auto',
                background: 'var(--vscode-editor-background)',
                color: 'var(--vscode-editor-foreground)',
                maxHeight: isBranchListOpen ? 320 : 0,
                opacity: isBranchListOpen ? 1 : 0,
                transform: isBranchListOpen ? 'translateY(0)' : 'translateY(-6px)',
                transition: 'max-height 0.22s ease, opacity 0.18s ease, transform 0.22s ease',
              }}
            >
              {localBranches.length === 0 ? (
                <div
                  style={{
                    padding: '10px 12px',
                    fontSize: 12,
                    color: 'var(--vscode-editor-foreground)',
                    opacity: 0.72,
                  }}
                >
                  현재 선택 가능한 다른 로컬 브랜치가 없습니다.
                </div>
              ) : (
                localBranches.map((b, i) => {
                  const isActive = defaultBranch === b.name;
                  const isProtected = b.status === 'protected';
                  return (
                    <div
                      key={b.name}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handlePick(b.name)}
                      style={{
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        borderBottom:
                          i === localBranches.length - 1 ? 'none' : '1px solid var(--vscode-panel-border)',
                        background: isActive
                          ? 'var(--vscode-list-activeSelectionBackground)'
                          : 'transparent',
                        color: isActive ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-editor-foreground)',
                      }}
                      onMouseOver={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
                      }}
                      onMouseOut={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                        <GitBranch size={12} style={{ color: 'var(--vscode-editor-foreground)', opacity: 0.75 }} />
                        <span
                          style={{
                            fontSize: 12,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {b.name}
                        </span>
                        {isProtected && (
                          <span
                            title="보호된 브랜치"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              fontSize: 10,
                              padding: '1px 6px',
                              borderRadius: 999,
                              background: 'rgba(155, 89, 182, 0.15)',
                              color: 'var(--vscode-charts-purple, #b48ead)',
                            }}
                          >
                            <ShieldCheck size={10} /> 보호됨
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8 }}>
              <div
                role="status"
                aria-live="polite"
                style={{
                  fontSize: 11,
                  color: webviewDescriptionForeground,
                  opacity: 0.92,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {savedToast ??
                  (defaultBranch
                    ? defaultBranchStillExists
                      ? '현재 설정이 다음 PR 생성에 적용됩니다.'
                      : '저장된 브랜치를 현재 저장소에서 찾을 수 없어 자동 추론을 사용합니다.'
                    : '미지정 시 보호 브랜치/일반 기본 브랜치 순으로 자동 추론합니다.')}
              </div>
              <button
                type="button"
                onClick={handleClear}
                disabled={!defaultBranch}
                title="저장된 기본값 삭제"
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  cursor: defaultBranch ? 'pointer' : 'not-allowed',
                  borderRadius: 4,
                  border: '1px solid var(--vscode-button-secondaryBorder, var(--vscode-contrastBorder))',
                  background: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  opacity: defaultBranch ? 1 : 0.5,
                  flexShrink: 0,
                }}
              >
                초기화
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};
