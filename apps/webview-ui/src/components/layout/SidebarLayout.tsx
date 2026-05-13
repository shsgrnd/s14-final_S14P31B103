import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AlertTriangle, KeyRound, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { SectionHeader } from '../common/SectionHeader';
import { SectionLoading } from '../common/SectionLoading';
import { AiApiKeySettingsModal } from '../settings/AiApiKeySettingsModal';
import { PrSettingsSidebar } from '../settings/PrSettingsSidebar';
import { footerIconBtn } from '../../shared/styles';
import { useGitCatStore } from '../../store/useGitCatStore';

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
 * 사이드바 전체 레이아웃 컴포넌트
 *
 * 역할:
 * - 아코디언 섹션(Git 작업, Files, 스냅샷, 브랜치 정리, 스태시) 렌더링
 * - 하단 푸터(설정 → AI 키 모달)
 * - 무거운 패널은 React.lazy로 분할 로드해 첫 페인트 이후 JS 파싱 부담을 줄임
 */
export const SidebarLayout: React.FC = () => {
  const snapshots = useGitCatStore((state) => state.snapshots);
  const branches = useGitCatStore((state) => state.branches);
  const stashes = useGitCatStore((state) => state.stashes);
  const notificationLogs = useGitCatStore((state) => state.notificationLogs);
  const clearNotificationLogs = useGitCatStore((state) => state.clearNotificationLogs);
  const branchCleanupBadgeCount = branches.filter(
    (b) => !b.name.includes('origin/') && b.name !== 'origin' && !b.name.startsWith('remotes/'),
  ).length;

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
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: expanded.git ? '1 1 0' : 'none',
            overflow: 'hidden',
          }}
        >
          <SectionHeader
            label="Git & AI"
            expanded={expanded.git}
            onToggle={() => setExpanded((p) => ({ ...p, git: !p.git }))}
          />
          {expanded.git && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <Suspense fallback={<SectionLoading label="Git 패널 불러오는 중…" />}>
                <GitActionPanel />
              </Suspense>
            </div>
          )}
        </section>

        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: expanded.filetree ? '1 1 0' : 'none',
            overflow: 'hidden',
            minHeight: expanded.filetree ? '120px' : 'auto',
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

        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: expanded.safety ? '1 1 0' : 'none',
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
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <Suspense fallback={<SectionLoading />}>
                <SnapshotTimeline />
              </Suspense>
            </div>
          )}
        </section>

        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: expanded.branch ? '1 1 0' : 'none',
            overflow: 'hidden',
          }}
        >
          <SectionHeader
            label="Branch Cleanup"
            expanded={expanded.branch}
            badge={branchCleanupBadgeCount > 0 ? branchCleanupBadgeCount : undefined}
            onToggle={() => setExpanded((p) => ({ ...p, branch: !p.branch }))}
          />
          {expanded.branch && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <Suspense fallback={<SectionLoading />}>
                <BranchCleanupPanel />
              </Suspense>
            </div>
          )}
        </section>

        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: expanded.stash ? '1 1 0' : 'none',
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
            <div style={{ flex: 1, overflowY: 'auto' }}>
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
          style={footerIconBtn}
          title="AI API 키 설정"
          aria-label="AI API 키 설정"
          onClick={() => setSettingsOpen(true)}
        >
          <KeyRound size={15} />
        </button>
        <button
          type="button"
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
              maxHeight: '80vh',
              background: 'var(--vscode-editor-background)',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
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
                  style={footerIconBtn}
                  title="닫기"
                  aria-label="닫기"
                  onClick={() => setNotificationCenterOpen(false)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div ref={logListRef} style={{ overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {notificationLogs.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', padding: '8px 0' }}>
                  아직 기록된 알림이 없습니다.
                </div>
              ) : (
                notificationLogs.map((log) => (
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
                    <div style={{ fontSize: '12px', lineHeight: 1.4 }}>{log.message}</div>
                  </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
