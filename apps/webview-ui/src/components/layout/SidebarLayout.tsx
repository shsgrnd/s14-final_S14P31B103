import React, { Suspense, lazy, useState } from 'react';
import { KeyRound, SlidersHorizontal } from 'lucide-react';
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
  const branchCleanupBadgeCount = branches.filter(
    (b) => !b.name.includes('origin/') && b.name !== 'origin' && !b.name.startsWith('remotes/'),
  ).length;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prSettingsOpen, setPrSettingsOpen] = useState(false);

  const [expanded, setExpanded] = useState({
    filetree: true,
    git: true,
    safety: false,
    branch: false,
    stash: false,
  });

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
    </div>
  );
};
