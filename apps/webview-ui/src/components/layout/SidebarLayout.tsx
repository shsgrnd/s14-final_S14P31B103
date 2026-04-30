import React, { useState } from 'react';
import { Settings, User } from 'lucide-react';
import { GitActionPanel } from '../git/GitActionPanel';
import { SnapshotTimeline } from '../safety/SnapshotTimeline';
import { BranchCleanupPanel } from '../git/BranchCleanupPanel';
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

  const [expanded, setExpanded] = useState({
    git: true,
    safety: false,
    branch: false,
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

        {/* ── Section 1: Git 작업 및 AI ── */}
        <section style={{ display: 'flex', flexDirection: 'column', flex: expanded.git ? '1 1 0' : 'none', overflow: 'hidden' }}>
          <SectionHeader
            label="Git 작업 및 AI"
            expanded={expanded.git}
            onToggle={() => setExpanded(p => ({ ...p, git: !p.git }))}
          />
          {expanded.git && <div style={{ flex: 1, overflowY: 'auto' }}><GitActionPanel /></div>}
        </section>

        {/* ── Section 2: 스냅샷 ── */}
        <section style={{ display: 'flex', flexDirection: 'column', flex: expanded.safety ? '1 1 0' : 'none', overflow: 'hidden' }}>
          <SectionHeader
            label="스냅샷"
            expanded={expanded.safety}
            badge={snapshots.length > 0 ? snapshots.length : undefined}
            onToggle={() => setExpanded(p => ({ ...p, safety: !p.safety }))}
          />
          {expanded.safety && <div style={{ flex: 1, overflowY: 'auto' }}><SnapshotTimeline /></div>}
        </section>

        {/* ── Section 3: 브랜치 정리 ── */}
        <section style={{ display: 'flex', flexDirection: 'column', flex: expanded.branch ? '1 1 0' : 'none', overflow: 'hidden' }}>
          <SectionHeader
            label="브랜치 정리"
            expanded={expanded.branch}
            badge={branches.length > 0 ? branches.length : undefined}
            onToggle={() => setExpanded(p => ({ ...p, branch: !p.branch }))}
          />
          {expanded.branch && <div style={{ flex: 1, overflowY: 'auto' }}><BranchCleanupPanel /></div>}
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
