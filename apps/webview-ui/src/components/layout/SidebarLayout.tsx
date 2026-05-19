import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, KeyRound, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { SectionHeader } from '../common/SectionHeader';
import { SectionLoading } from '../common/SectionLoading';
import { AiApiKeySettingsModal } from '../settings/AiApiKeySettingsModal';
import { PrSettingsSidebar } from '../settings/PrSettingsSidebar';
import { footerIconBtn } from '../../shared/styles';
import { useGitCatStore } from '../../store/useGitCatStore';
import { SidebarSectionNotificationProvider } from '../../app/SidebarSectionNotificationContext';
import { FooterSectionNotificationBalloon } from './FooterSectionNotificationBalloon';
import { SidebarResizeHandle } from './SidebarResizeHandle';
import {
  getNextExpandedSection,
  SIDEBAR_SECTION_LABEL,
} from '../../hooks/sidebarSectionLayout';
import { useSidebarSectionExpanded } from '../../hooks/useSidebarSectionExpanded';
import {
  type SidebarSectionKey,
  useSidebarSectionWeights,
} from '../../hooks/useSidebarSectionWeights';
import { snapshotsVisibleInSidebarTimeline } from '../../shared/snapshotTimelineVisibility';

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
 * flex-grow 가중치는 useSidebarSectionWeights 로 관리(기본 모두 1 → 펼친 섹션끼리 1/N).
 * 리사이즈 핸들은 접힌 섹션을 건너뛰고, 화면에 보이는 열린 패널 사이에만 표시된다.
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
  const snapshotTimelineBadgeCount = useMemo(
    () => snapshotsVisibleInSidebarTimeline(snapshots).length,
    [snapshots],
  );
  const stashes = useGitCatStore((state) => state.stashes);
  const notificationLogs = useGitCatStore((state) => state.notificationLogs);
  const clearNotificationLogs = useGitCatStore((state) => state.clearNotificationLogs);
  const removeNotificationLog = useGitCatStore((state) => state.removeNotificationLog);
  const sectionNotifications = useGitCatStore((state) => state.sectionNotifications);
  const branchCleanupInSettingsMode = useGitCatStore((state) => state.branchCleanupInSettingsMode);
  const conflicts = useGitCatStore((state) => state.conflicts);
  const currentAIDraft = useGitCatStore((state) => state.currentAIDraft);
  const mergeApplyFollowupHint = useGitCatStore((state) => state.mergeApplyFollowupHint);
  const isMergeAnalysisLoading = useGitCatStore((state) => state.isMergeAnalysisLoading);
  const isMergeProposalLoading = useGitCatStore((state) => state.isMergeProposalLoading);

  const mergeReviewActiveRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prSettingsOpen, setPrSettingsOpen] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [clearAllLogsConfirmOpen, setClearAllLogsConfirmOpen] = useState(false);
  const [sectionBalloonOpen, setSectionBalloonOpen] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<number>(Date.now());
  const logListRef = useRef<HTMLDivElement | null>(null);

  const sectionNotifCount = useMemo(() => Object.keys(sectionNotifications).length, [sectionNotifications]);
  const aggregateSectionAlertsToFooter = !prSettingsOpen && !branchCleanupInSettingsMode;
  const sectionNotifSnapshot = useMemo(() => JSON.stringify(sectionNotifications), [sectionNotifications]);
  const prevSectionNotifSnapshot = useRef(sectionNotifSnapshot);

  const openNotificationCenter = useCallback(() => {
    setNotificationCenterOpen(true);
    setLastReadAt(Date.now());
  }, []);

  useEffect(() => {
    const active =
      conflicts.length > 0 ||
      currentAIDraft != null ||
      mergeApplyFollowupHint != null ||
      isMergeAnalysisLoading ||
      isMergeProposalLoading;
    if (active && !mergeReviewActiveRef.current) {
      setExpanded((p) => ({ ...p, git: true }));
    }
    mergeReviewActiveRef.current = active;
  }, [
    conflicts.length,
    currentAIDraft,
    mergeApplyFollowupHint,
    isMergeAnalysisLoading,
    isMergeProposalLoading,
  ]);

  useEffect(() => {
    if (!aggregateSectionAlertsToFooter) {
      setSectionBalloonOpen(false);
      return;
    }
    if (sectionNotifCount === 0) {
      prevSectionNotifSnapshot.current = sectionNotifSnapshot;
      setSectionBalloonOpen(false);
      return;
    }
    /** 기록 모달이 열려 있는 동안에는 말풍선을 다시 켜지 않음(스냅샷만 동기화) */
    if (notificationCenterOpen) {
      prevSectionNotifSnapshot.current = sectionNotifSnapshot;
      return;
    }
    if (sectionNotifSnapshot !== prevSectionNotifSnapshot.current) {
      setSectionBalloonOpen(true);
    }
    prevSectionNotifSnapshot.current = sectionNotifSnapshot;
  }, [aggregateSectionAlertsToFooter, sectionNotifSnapshot, sectionNotifCount, notificationCenterOpen]);

  useEffect(() => {
    if (notificationCenterOpen) setSectionBalloonOpen(false);
  }, [notificationCenterOpen]);

  /** 푸터 알림: 항상 오류/알림 기록 모달을 연다(섹션 말풍선만 토글하지 않음). 모달이 말풍선을 덮는다 */
  const handleFooterAlertClick = useCallback(() => {
    setSectionBalloonOpen(false);
    openNotificationCenter();
  }, [openNotificationCenter]);

  const { expanded, setExpanded, toggleSection } = useSidebarSectionExpanded();

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
   * 열린 섹션 `above` 바로 아래에 붙는 리사이즈 핸들.
   * 아래쪽에서 다음으로 펼쳐진 섹션(접힌 섹션은 건너뜀)과 높이 비율을 조절한다.
   */
  const makeHandleProps = (above: SidebarSectionKey, below: SidebarSectionKey) => ({
    visible: true,
    getAboveHeight: () => sectionRefs[above].current?.getBoundingClientRect().height ?? 0,
    getBelowHeight: () => sectionRefs[below].current?.getBoundingClientRect().height ?? 0,
    getAboveWeight: () => weights[above],
    getBelowWeight: () => weights[below],
    onWeightsChange: (newAbove: number, newBelow: number) => setPairWeights(above, below, newAbove, newBelow),
    minSectionPx: SECTION_MIN_HEIGHT_PX,
    ariaLabel: `${SIDEBAR_SECTION_LABEL[above]}와 ${SIDEBAR_SECTION_LABEL[below]} 섹션 높이 조절`,
  });

  const renderSectionResizeHandle = (above: SidebarSectionKey) => {
    if (!expanded[above]) return null;
    const below = getNextExpandedSection(above, expanded);
    if (!below) return null;
    return (
      <SidebarResizeHandle
        key={`resize-${above}-${below}`}
        {...makeHandleProps(above, below)}
      />
    );
  };

  useEffect(() => {
    if (!notificationCenterOpen) {
      setClearAllLogsConfirmOpen(false);
      return;
    }
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
          border: 'var(--vscode-textLink-foreground, var(--vscode-focusBorder))',
          bg: 'rgba(120, 190, 255, 0.18)',
          text: 'var(--vscode-textLink-foreground, var(--vscode-editor-foreground))',
        };
    }
  };

  const handleDismissOneLog = (id: string) => {
    removeNotificationLog(id);
  };

  const handleTrashClearAllClick = () => {
    if (notificationLogs.length === 0) return;
    setClearAllLogsConfirmOpen(true);
  };

  const handleConfirmClearAllLogs = () => {
    clearNotificationLogs();
    setLastReadAt(Date.now());
    setClearAllLogsConfirmOpen(false);
  };

  return (
    <SidebarSectionNotificationProvider
      prSettingsOpen={prSettingsOpen}
      branchCleanupInSettingsMode={branchCleanupInSettingsMode}
    >
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
            onToggle={() => toggleSection('git')}
          />
          {expanded.git && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <Suspense fallback={<SectionLoading label="Git 패널 불러오는 중…" />}>
                <GitActionPanel />
              </Suspense>
            </div>
          )}
        </section>

        {renderSectionResizeHandle('git')}

        <section
          ref={sectionRefs.filetree}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: expanded.filetree ? `${weights.filetree} 1 0` : 'none',
            minHeight: expanded.filetree ? FILES_MIN_HEIGHT : 'auto',
            overflow: 'hidden',
          }}
        >
          <SectionHeader
            label="Files"
            expanded={expanded.filetree}
            onToggle={() => toggleSection('filetree')}
          />
          {expanded.filetree && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <Suspense fallback={<SectionLoading label="파일 트리 불러오는 중…" />}>
                <FileTreePanel />
              </Suspense>
            </div>
          )}
        </section>

        {renderSectionResizeHandle('filetree')}

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
            badge={snapshotTimelineBadgeCount > 0 ? snapshotTimelineBadgeCount : undefined}
            onToggle={() => toggleSection('safety')}
          />
          {expanded.safety && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <Suspense fallback={<SectionLoading />}>
                <SnapshotTimeline />
              </Suspense>
            </div>
          )}
        </section>

        {renderSectionResizeHandle('safety')}

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
            onToggle={() => toggleSection('branch')}
          />
          {expanded.branch && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <Suspense fallback={<SectionLoading />}>
                <BranchCleanupPanel />
              </Suspense>
            </div>
          )}
        </section>

        {renderSectionResizeHandle('branch')}

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
            onToggle={() => toggleSection('stash')}
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
          position: 'relative',
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
        <FooterSectionNotificationBalloon
          paintVisible={sectionBalloonOpen && !notificationCenterOpen}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <button
            type="button"
            className="gitcat-icon-press"
            style={{ ...footerIconBtn, position: 'relative' }}
            title="오류/알림 기록 보기"
            aria-label="오류/알림 기록 보기"
            onClick={handleFooterAlertClick}
          >
            <AlertTriangle size={15} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  transform: 'translate(40%, -35%)',
                  minWidth: '16px',
                  minHeight: '16px',
                  borderRadius: '999px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background:
                    'var(--vscode-statusBarItem-errorBackground, var(--vscode-inputValidation-errorBackground))',
                  color:
                    'var(--vscode-statusBarItem-errorForeground, var(--vscode-badge-foreground, var(--vscode-button-foreground)))',
                  border: '1px solid var(--vscode-inputValidation-errorBorder, transparent)',
                  fontSize: '9px',
                  fontWeight: 700,
                  textAlign: 'center',
                  padding: '0 4px',
                  boxSizing: 'border-box',
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
        </div>
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
            zIndex: 100,
            padding: '16px',
          }}
          onClick={() => setNotificationCenterOpen(false)}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '560px',
              /* 알림 개수와 무관하게 동일한 높이 — 목록만 스크롤. 웹뷰/창이 낮으면 maxHeight만큼 축소 (기존 420px의 1.5배) */
              height: '630px',
              maxHeight: 'min(80vh, calc(100% - 32px))',
              minHeight: 0,
              boxSizing: 'border-box',
              background: 'var(--vscode-editor-background)',
              color: 'var(--vscode-editor-foreground)',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '6px',
              display: 'grid',
              gridTemplateRows: 'auto minmax(0, 1fr)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {clearAllLogsConfirmOpen && (
              <div
                role="presentation"
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 20,
                  background: 'rgba(0, 0, 0, 0.42)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px',
                  boxSizing: 'border-box',
                }}
                onClick={() => setClearAllLogsConfirmOpen(false)}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="gitcat-clear-logs-title"
                  style={{
                    width: '100%',
                    maxWidth: '360px',
                    background: 'var(--vscode-editor-background)',
                    color: 'var(--vscode-editor-foreground)',
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: '8px',
                    padding: '16px 18px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    id="gitcat-clear-logs-title"
                    style={{ fontSize: '13px', lineHeight: 1.5, marginBottom: '14px' }}
                  >
                    오류/알림 기록을 전체 다 삭제하시겠습니까?
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setClearAllLogsConfirmOpen(false)}
                      style={{
                        fontSize: '12px',
                        padding: '6px 14px',
                        borderRadius: '4px',
                        border: '1px solid var(--vscode-button-secondaryBorder, var(--vscode-panel-border))',
                        background: 'var(--vscode-button-secondaryBackground)',
                        color: 'var(--vscode-button-secondaryForeground)',
                        cursor: 'pointer',
                      }}
                    >
                      아니요
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmClearAllLogs}
                      style={{
                        fontSize: '12px',
                        padding: '6px 14px',
                        borderRadius: '4px',
                        border: '1px solid var(--vscode-button-border)',
                        background: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        cursor: 'pointer',
                      }}
                    >
                      예
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderBottom: '1px solid var(--vscode-panel-border)',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vscode-editor-foreground)' }}>
                오류/알림 기록
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  className="gitcat-icon-press"
                  style={{ ...footerIconBtn, color: 'var(--vscode-editor-foreground)', opacity: 0.9 }}
                  title="기록 비우기"
                  aria-label="기록 비우기"
                  disabled={notificationLogs.length === 0}
                  onClick={handleTrashClearAllClick}
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  className="gitcat-icon-press"
                  style={{ ...footerIconBtn, color: 'var(--vscode-editor-foreground)', opacity: 0.9 }}
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
                padding: '10px 14px',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {notificationLogs.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--vscode-editor-foreground)', opacity: 0.78, padding: '8px 0' }}>
                  아직 기록된 알림이 없습니다.
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {notificationLogs.map((log) => {
                    const tone = toneStyle(log.type);
                    return (
                      <div
                        key={log.id}
                        style={{
                          position: 'relative',
                          minWidth: 0,
                          borderLeft: `3px solid ${tone.border}`,
                          borderTop: '1px solid var(--vscode-panel-border)',
                          borderRight: '1px solid var(--vscode-panel-border)',
                          borderBottom: '1px solid var(--vscode-panel-border)',
                          borderRadius: 6,
                          padding: '8px 36px 10px 10px',
                          background: 'var(--vscode-editorWidget-background, var(--vscode-sideBar-background))',
                        }}
                      >
                        <button
                          type="button"
                          className="gitcat-icon-press"
                          title="이 항목만 삭제"
                          aria-label="이 알림 삭제"
                          onClick={() => handleDismissOneLog(log.id)}
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            ...footerIconBtn,
                            color: 'var(--vscode-editor-foreground)',
                            opacity: 0.88,
                          }}
                        >
                          <X size={14} />
                        </button>
                        <div
                          style={{
                            fontSize: '10px',
                            color: 'var(--vscode-editor-foreground)',
                            opacity: 0.85,
                            marginBottom: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexWrap: 'wrap',
                            paddingRight: 4,
                          }}
                        >
                          <span>{formatTime(log.timestamp)}</span>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '999px',
                              border: `1px solid ${tone.border}`,
                              background: tone.bg,
                              color: tone.text,
                              fontWeight: 700,
                            }}
                          >
                            {log.type.toUpperCase()}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            lineHeight: 1.45,
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word',
                            color: 'var(--vscode-editor-foreground)',
                          }}
                        >
                          {log.message}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </SidebarSectionNotificationProvider>
  );
};
