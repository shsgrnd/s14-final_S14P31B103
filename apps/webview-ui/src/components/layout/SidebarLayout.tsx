import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AlertTriangle, KeyRound, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { SectionHeader } from '../common/SectionHeader';
import { SectionLoading } from '../common/SectionLoading';
import { AiApiKeySettingsModal } from '../settings/AiApiKeySettingsModal';
import { PrSettingsSidebar } from '../settings/PrSettingsSidebar';
import { footerIconBtn } from '../../shared/styles';
import { useGitCatStore } from '../../store/useGitCatStore';
import { SidebarResizeHandle } from './SidebarResizeHandle';
import {
  type SidebarSectionKey,
  useSidebarSectionWeights,
} from '../../hooks/useSidebarSectionWeights';

const GitActionPanel = lazy(() =>
  import('../git/GitActionPanel').then((m) => ({ default: m.GitActionPanel })),
);
const FileTreePanel = lazy(() =>
  import('../git/FileTreePanel').then((m) => ({ default: m.FileTreePanel })),
);
const SnapshotTimeline = lazy(() =>
  import('../safety/SnapshotTimeline').then((m) => ({ default: m.SnapshotTimeline })),
);
const BranchCleanupPanel = lazy(() =>
  import('../git/BranchCleanupPanel').then((m) => ({ default: m.BranchCleanupPanel })),
);
const StashPanel = lazy(() => import('../git/StashPanel').then((m) => ({ default: m.StashPanel })));

/**
 * 사이드바 섹션 레이아웃 토큰
 * - SECTION_MIN_HEIGHT: 펼친 섹션이 다른 섹션의 콘텐츠 확장(예: New Branch 폼)에도 짜부라지지 않도록 보장하는 최소 높이
 * - FILES_MIN_HEIGHT: 파일 트리 가독성을 위해 일반 섹션보다 큰 최소 높이
 *
 * 합산 검증: SECTION_MIN_HEIGHT(80) × 4 + FILES_MIN_HEIGHT(120) = 440px
 *   → 일반적인 VS Code 사이드바 높이(~600-900px) 범위 내에서 5개 섹션 모두 펼쳐도 잘리지 않음
 *
 * 각 섹션의 flex-grow 가중치는 useSidebarSectionWeights 훅으로 관리되며 (기본 Files=2, 그 외 1),
 * 인접 섹션 사이 SidebarResizeHandle 을 드래그해 사용자가 조정한다.
 */
const SECTION_MIN_HEIGHT = '80px';
const FILES_MIN_HEIGHT = '120px';
const SECTION_MIN_HEIGHT_PX = 80;

/**
 * 사이드바 전체 레이아웃 컴포넌트
 *
 * 역할:
 * - 아코디언 섹션(Git 작업, Files, 스냅샷, 브랜치 정리, 스태시) 렌더링
 * - 하단 푸터(설정 → AI 키 모달)
 * - 무거운 패널은 React.lazy로 분할 로드해 첫 페인트 이후 JS 파싱 부담을 줄임
 */
export const SidebarLayout: React.FC = () => {
  const snapshots = useGitCatStore((state) => state.snapshots);
  const stashes = useGitCatStore((state) => state.stashes);
  const notificationLogs = useGitCatStore((state) => state.notificationLogs);
  const clearNotificationLogs = useGitCatStore((state) => state.clearNotificationLogs);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prSettingsOpen, setPrSettingsOpen] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<number>(Date.now());
  const logListRef = useRef<HTMLDivElement | null>(null);

  const [expanded, setExpanded] = useState({
    filetree: true,
    git: true,
    safety: false,
    branch: false,
    stash: false,
  });

  // 세로 리사이즈: 각 섹션의 현재 렌더 높이를 측정하기 위한 refs
  // (RefObject<HTMLElement> 형식이어야 <section ref={...}> 의 LegacyRef 와 호환됨)
  const sectionRefs: Record<SidebarSectionKey, React.RefObject<HTMLElement>> = {
    git: useRef<HTMLElement>(null!),
    filetree: useRef<HTMLElement>(null!),
    safety: useRef<HTMLElement>(null!),
    branch: useRef<HTMLElement>(null!),
    stash: useRef<HTMLElement>(null!),
  };
  const { weights, setPairWeights } = useSidebarSectionWeights();

  /**
   * 두 인접 섹션 사이에 들어갈 리사이즈 핸들에 필요한 props 를 생성.
   * - visible: 두 섹션이 모두 펼쳐졌을 때만 노출 (한쪽이 접혀 있으면 리사이즈 의미가 없음)
   * - getHeight: 드래그 시작 시점의 실제 렌더 높이를 측정
   */
  const makeHandleProps = (above: SidebarSectionKey, below: SidebarSectionKey) => ({
    visible: expanded[above] && expanded[below],
    getAboveHeight: () => sectionRefs[above].current?.getBoundingClientRect().height ?? 0,
    getBelowHeight: () => sectionRefs[below].current?.getBoundingClientRect().height ?? 0,
    getAboveWeight: () => weights[above],
    getBelowWeight: () => weights[below],
    onWeightsChange: (newAbove: number, newBelow: number) => setPairWeights(above, below, newAbove, newBelow),
    minSectionPx: SECTION_MIN_HEIGHT_PX,
    ariaLabel: `${above}와 ${below} 섹션 높이 조절`,
  });

  useEffect(() => {
    if (!notificationCenterOpen) return;
    const el = logListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [notificationCenterOpen, notificationLogs.length]);

  const formatTime = (timestamp: number): string =>
    new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const unreadCount = notificationLogs.filter((log) => log.timestamp > lastReadAt).length;

  const openNotificationCenter = () => {
    setNotificationCenterOpen(true);
    setLastReadAt(Date.now());
  };

  const toneStyle = (type: 'info' | 'warning' | 'error' | 'success') => {
    switch (type) {
      case 'error':
        return {
          border: 'var(--vscode-inputValidation-errorBorder)',
          bg: 'var(--vscode-inputValidation-errorBackground)',
          text: 'var(--vscode-errorForeground)',
        };
      case 'warning':
        return {
          border: 'var(--vscode-inputValidation-warningBorder)',
          bg: 'var(--vscode-inputValidation-warningBackground)',
          text: 'var(--vscode-editorWarning-foreground)',
        };
      case 'success':
        return {
          border: 'var(--vscode-testing-iconPassed)',
          bg: 'rgba(61, 153, 112, 0.12)',
          text: 'var(--vscode-testing-iconPassed)',
        };
      default:
        return {
          border: 'var(--vscode-focusBorder)',
          bg: 'rgba(111, 179, 224, 0.12)',
          text: 'var(--vscode-focusBorder)',
        };
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--vscode-sideBar-background)',
        color: 'var(--vscode-sideBar-foreground)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <section
          ref={sectionRefs.git}
          style={{
            display: 'flex',
            flexDirection: 'column',
            // 다른 섹션이 펼쳐져도 Git&AI 영역이 0으로 짜부라지지 않도록 min-height 유지
            flex: expanded.git ? `${weights.git} 1 0` : 'none',
            minHeight: expanded.git ? SECTION_MIN_HEIGHT : 'auto',
            overflow: 'hidden',
          }}
        >
          <SectionHeader
            label="Git & AI"
            expanded={expanded.git}
            onToggle={() => setExpanded((p) => ({ ...p, git: !p.git }))}
          />
          {expanded.git && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <Suspense fallback={<SectionLoading label="Git 패널 불러오는 중…" />}>
                <GitActionPanel />
              </Suspense>
            </div>
          )}
        </section>

        <SidebarResizeHandle {...makeHandleProps('git', 'filetree')} />

        <section
          ref={sectionRefs.filetree}
          style={{
            display: 'flex',
            flexDirection: 'column',
            // Files 영역은 기본 가중치가 2배(useSidebarSectionWeights 기본값)라 다른 섹션이 펼쳐져도 트리 가독성을 우선 확보
            flex: expanded.filetree ? `${weights.filetree} 1 0` : 'none',
            minHeight: expanded.filetree ? FILES_MIN_HEIGHT : 'auto',
            overflow: 'hidden',
          }}
        >
          <SectionHeader
            label="Files"
            expanded={expanded.filetree}
            onToggle={() => setExpanded((p) => ({ ...p, filetree: !p.filetree }))}
          />
          {expanded.filetree && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <Suspense fallback={<SectionLoading label="파일 트리 불러오는 중…" />}>
                <FileTreePanel />
              </Suspense>
            </div>
          )}
        </section>

        <SidebarResizeHandle {...makeHandleProps('filetree', 'safety')} />

        <section
          ref={sectionRefs.safety}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: expanded.safety ? `${weights.safety} 1 0` : 'none',
            minHeight: expanded.safety ? SECTION_MIN_HEIGHT : 'auto',
            overflow: 'hidden',
          }}
        >
          <SectionHeader
            label="Snapshots"
            expanded={expanded.safety}
            badge={snapshots.length > 0 ? snapshots.length : undefined}
            onToggle={() => setExpanded((p) => ({ ...p, safety: !p.safety }))}
          />
          {expanded.safety && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <Suspense fallback={<SectionLoading />}>
                <SnapshotTimeline />
              </Suspense>
            </div>
          )}
        </section>

        <SidebarResizeHandle {...makeHandleProps('safety', 'branch')} />

        <section
          ref={sectionRefs.branch}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: expanded.branch ? `${weights.branch} 1 0` : 'none',
            minHeight: expanded.branch ? SECTION_MIN_HEIGHT : 'auto',
            overflow: 'hidden',
          }}
        >
          <SectionHeader
            label="Branch Cleanup"
            expanded={expanded.branch}
            onToggle={() => setExpanded((p) => ({ ...p, branch: !p.branch }))}
          />
          {expanded.branch && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <Suspense fallback={<SectionLoading />}>
                <BranchCleanupPanel />
              </Suspense>
            </div>
          )}
        </section>

        <SidebarResizeHandle {...makeHandleProps('branch', 'stash')} />

        <section
          ref={sectionRefs.stash}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: expanded.stash ? `${weights.stash} 1 0` : 'none',
            minHeight: expanded.stash ? SECTION_MIN_HEIGHT : 'auto',
            overflow: 'hidden',
          }}
        >
          <SectionHeader
            label="Git Stash"
            expanded={expanded.stash}
            badge={stashes.length > 0 ? stashes.length : undefined}
            onToggle={() => setExpanded((p) => ({ ...p, stash: !p.stash }))}
          />
          {expanded.stash && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <Suspense fallback={<SectionLoading />}>
                <StashPanel />
              </Suspense>
            </div>
          )}
        </section>
      </div>

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 4,
          padding: '6px 10px',
          borderTop: '1px solid var(--vscode-panel-border)',
          background: 'var(--vscode-sideBar-background)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          className="gitcat-icon-press"
          style={{ ...footerIconBtn, position: 'relative' }}
          title="알림 기록"
          aria-label="오류/알림 기록 보기"
          onClick={openNotificationCenter}
        >
          <AlertTriangle size={15} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                transform: 'translate(40%, -35%)',
                minWidth: '14px',
                height: '14px',
                borderRadius: '999px',
                background: 'var(--vscode-errorForeground)',
                color: '#fff',
                fontSize: '9px',
                lineHeight: '14px',
                textAlign: 'center',
                padding: '0 3px',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className="gitcat-icon-press"
          style={footerIconBtn}
          title="AI API 키 설정"
          aria-label="AI API 키 설정"
          onClick={() => setSettingsOpen(true)}
        >
          <KeyRound size={15} />
        </button>
        <button
          type="button"
          className="gitcat-icon-press"
          style={footerIconBtn}
          title="환경설정"
          aria-label="환경설정 (PR 기본 target 브랜치 등)"
          onClick={() => setPrSettingsOpen(true)}
        >
          <SlidersHorizontal size={15} />
        </button>
      </footer>

      <AiApiKeySettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <PrSettingsSidebar open={prSettingsOpen} onClose={() => setPrSettingsOpen(false)} />
      {notificationCenterOpen && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            padding: '16px',
          }}
          onClick={() => setNotificationCenterOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '560px',
              /* 알림 개수와 무관하게 동일한 높이 — 목록만 스크롤. 웹뷰/창이 낮으면 maxHeight만큼 축소 (기존 420px의 1.5배) */
              height: '630px',
              maxHeight: 'min(80vh, calc(100% - 32px))',
              minHeight: 0,
              boxSizing: 'border-box',
              background: 'var(--vscode-editor-background)',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '6px',
              display: 'grid',
              gridTemplateRows: 'auto minmax(0, 1fr)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderBottom: '1px solid var(--vscode-panel-border)',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600 }}>오류/알림 기록</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  className="gitcat-icon-press"
                  style={footerIconBtn}
                  title="기록 비우기"
                  aria-label="기록 비우기"
                  onClick={() => {
                    clearNotificationLogs();
                    setLastReadAt(Date.now());
                  }}
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  className="gitcat-icon-press"
                  style={footerIconBtn}
                  title="닫기"
                  aria-label="닫기"
                  onClick={() => setNotificationCenterOpen(false)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div
              ref={logListRef}
              className="gitcat-notification-log-scroll"
              style={{
                padding: '10px 12px',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {notificationLogs.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', padding: '8px 0' }}>
                  아직 기록된 알림이 없습니다.
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {notificationLogs.map((log) => (
                  <div key={log.id} style={{ borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        borderLeft: `3px solid ${toneStyle(log.type).border}`,
                        borderTop: '1px solid var(--vscode-panel-border)',
                        borderRight: '1px solid var(--vscode-panel-border)',
                        borderBottom: '1px solid var(--vscode-panel-border)',
                        borderRadius: '4px',
                        padding: '8px 10px',
                        background: 'var(--vscode-sideBar-background)',
                      }}
                    >
                    <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{formatTime(log.timestamp)}</span>
                      <span
                        style={{
                          padding: '1px 6px',
                          borderRadius: '999px',
                          border: `1px solid ${toneStyle(log.type).border}`,
                          background: toneStyle(log.type).bg,
                          color: toneStyle(log.type).text,
                          fontWeight: 700,
                        }}
                      >
                        {log.type.toUpperCase()}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        lineHeight: 1.4,
                        overflowWrap: 'break-word',
                        wordBreak: 'break-word',
                      }}
                    >
                      {log.message}
                    </div>
                  </div>
                  </div>
                ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
