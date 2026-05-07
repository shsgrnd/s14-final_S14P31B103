import React, { useState } from 'react';
import { Settings, User } from 'lucide-react';
import { GitActionPanel } from '../git/GitActionPanel';
import { SnapshotTimeline } from '../safety/SnapshotTimeline';
import { BranchCleanupPanel } from '../git/BranchCleanupPanel';
import { StashPanel } from '../git/StashPanel';
import { FileTreePanel } from '../git/FileTreePanel';
import { SectionHeader } from '../common/SectionHeader';
import { footerIconBtn } from '../../shared/styles';
import { useGitCatStore } from '../../store/useGitCatStore';

/**
 * 사이드바 전체 레이아웃 컴포넌트
 *
 * 역할:
 * - 3개의 아코디언 섹션(Git 작업, 스냅샷, 브랜치 정리) 렌더링
 * - 각 섹션의 expanded 상태 관리
 * - 하단 푸터(계정, 설정 버튼) 렌더링
 *
 * App.tsx는 이 컴포넌트를 단순히 마운트만 하며,
 * 섹션 상태는 이 컴포넌트 내부에서 완결됩니다.
 */
export const SidebarLayout: React.FC = () => {
  const snapshots = useGitCatStore(state => state.snapshots);
  const branches = useGitCatStore(state => state.branches);
  const stashes = useGitCatStore(state => state.stashes);
  const branchCleanupBadgeCount = branches.filter((b) =>
    !b.name.includes('origin/') &&
    b.name !== 'origin' &&
    !b.name.startsWith('remotes/')
  ).length;

  const [expanded, setExpanded] = useState({
    filetree: true,
    git: true,
    safety: false,
    branch: false,
    stash: false,
  });

  return (
    <div style={{
      height: '100vh', width: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--vscode-sideBar-background)',
      color: 'var(--vscode-sideBar-foreground)',
      overflow: 'hidden',
    }}>
      {/* ── Accordion Sections Container ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Section 0: Git & AI ── */}
        <section style={{ display: 'flex', flexDirection: 'column', flex: expanded.git ? '1 1 0' : 'none', overflow: 'hidden' }}>
          <SectionHeader
            label="Git & AI"
            expanded={expanded.git}
            onToggle={() => setExpanded(p => ({ ...p, git: !p.git }))}
          />
          {expanded.git && <div style={{ flex: 1, overflowY: 'auto' }}><GitActionPanel /></div>}
        </section>

        {/* ── Section 1: Files ── */}
        <section style={{ display: 'flex', flexDirection: 'column', flex: expanded.filetree ? '1 1 0' : 'none', overflow: 'hidden', minHeight: expanded.filetree ? '120px' : 'auto' }}>
          <SectionHeader
            label="Files"
            expanded={expanded.filetree}
            onToggle={() => setExpanded(p => ({ ...p, filetree: !p.filetree }))}
          />
          {expanded.filetree && <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}><FileTreePanel /></div>}
        </section>

        {/* ── Section 2: 스냅샷 ── */}
        <section style={{ display: 'flex', flexDirection: 'column', flex: expanded.safety ? '1 1 0' : 'none', overflow: 'hidden' }}>
          <SectionHeader
            label="Snapshots"
            expanded={expanded.safety}
            badge={snapshots.length > 0 ? snapshots.length : undefined}
            onToggle={() => setExpanded(p => ({ ...p, safety: !p.safety }))}
          />
          {expanded.safety && <div style={{ flex: 1, overflowY: 'auto' }}><SnapshotTimeline /></div>}
        </section>

        {/* ── Section 3: 브랜치 정리 ── */}
        <section style={{ display: 'flex', flexDirection: 'column', flex: expanded.branch ? '1 1 0' : 'none', overflow: 'hidden' }}>
          <SectionHeader
            label="Branch Cleanup"
            expanded={expanded.branch}
            badge={branchCleanupBadgeCount > 0 ? branchCleanupBadgeCount : undefined}
            onToggle={() => setExpanded(p => ({ ...p, branch: !p.branch }))}
          />
          {expanded.branch && <div style={{ flex: 1, overflowY: 'auto' }}><BranchCleanupPanel /></div>}
        </section>

        {/* ── Section 4: Git Stash ── */}
        <section style={{ display: 'flex', flexDirection: 'column', flex: expanded.stash ? '1 1 0' : 'none', overflow: 'hidden' }}>
          <SectionHeader
            label="Git Stash"
            expanded={expanded.stash}
            badge={stashes.length > 0 ? stashes.length : undefined}
            onToggle={() => setExpanded(p => ({ ...p, stash: !p.stash }))}
          />
          {expanded.stash && <div style={{ flex: 1, overflowY: 'auto' }}><StashPanel /></div>}
        </section>

      </div>

      {/* ── Footer ── */}
      <footer style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px',
        borderTop: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-sideBar-background)',
        flexShrink: 0,
      }}>
        <button style={footerIconBtn} title="계정">
          <User size={15} />
        </button>
        <button style={footerIconBtn} title="설정">
          <Settings size={15} />
        </button>
      </footer>
    </div>
  );
};
