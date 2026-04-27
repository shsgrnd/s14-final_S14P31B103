import React, { useEffect, useState } from 'react';
import { useGitCatStore } from './store/useGitCatStore';
import { useVsCodeApi } from './hooks/useVsCodeApi';
import { SnapshotTimeline } from './components/safety/SnapshotTimeline';
import { ConflictAnalysisView } from './components/merge/ConflictAnalysisView';
import { AIDraftPanel } from './components/merge/AIDraftPanel';
import { GitActionPanel } from './components/git/GitActionPanel';
import { BranchCleanupPanel } from './components/git/BranchCleanupPanel';
import { CommitEditor } from './components/commit/CommitEditor';
import { Settings, User, ChevronDown, ChevronRight } from 'lucide-react';

declare global {
  interface Window {
    VIEW_MODE: 'sidebar' | 'main';
  }
}

/**
 * App Component
 * GitCat WebView의 메인 엔트리 포인트입니다.
 */
function App() {
  const { handleMessage, snapshots, branches } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();
  const [activeMainView, setActiveMainView] = useState<'draft' | 'commit'>('draft');

  // Sidebar Sections Expanded States
  const [expanded, setExpanded] = useState({
    git: true,
    safety: false,
    branch: false,
  });

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    sendMessage('GET_SNAPSHOTS');
    sendMessage('GET_BRANCHES');
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessage, sendMessage]);

  const viewMode = window.VIEW_MODE || 'sidebar';

  if (viewMode === 'sidebar') {
    return (
      <div style={{
        height: '100vh', width: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--vscode-sideBar-background)',
        color: 'var(--vscode-sideBar-foreground)',
        overflow: 'hidden',
      }}>
        {/* Container for Accordion Sections */}
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

        {/* Footer */}
        <footer style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px',
          borderTop: '1px solid var(--vscode-panel-border)',
          background: 'var(--vscode-sideBar-background)',
          flexShrink: 0,
        }}>
          <button style={footerBtnStyle} title="계정">
            <User size={15} />
          </button>
          <button style={footerBtnStyle} title="설정">
            <Settings size={15} />
          </button>
        </footer>
      </div>
    );
  }

  // ── Main Panel Mode ──
  return (
    <div style={{
      height: '100vh', width: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
    }}>
      <header style={{
        height: '35px', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '16px',
        borderBottom: '1px solid var(--vscode-panel-border)',
        flexShrink: 0,
      }}>
        <TabButton label="AI 병합 중재안" active={activeMainView === 'draft'} onClick={() => setActiveMainView('draft')} />
        <TabButton label="커밋 에디터" active={activeMainView === 'commit'} onClick={() => setActiveMainView('commit')} />
      </header>

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {activeMainView === 'draft' ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <AIDraftPanel />
            </div>
            <div style={{ height: '33%', borderTop: '1px solid var(--vscode-panel-border)', overflowY: 'auto' }}>
              <ConflictAnalysisView />
            </div>
          </div>
        ) : (
          <CommitEditor />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

interface SectionHeaderProps {
  label: string;
  expanded: boolean;
  badge?: number;
  onToggle: () => void;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ label, expanded, badge, onToggle }) => (
  <div
    onClick={onToggle}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '5px 8px', cursor: 'pointer', userSelect: 'none',
      borderBottom: '1px solid var(--vscode-panel-border)',
    }}
    onMouseOver={e => (e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)')}
    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {expanded
        ? <ChevronDown size={14} style={{ color: 'var(--vscode-descriptionForeground)' }} />
        : <ChevronRight size={14} style={{ color: 'var(--vscode-descriptionForeground)' }} />
      }
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--vscode-sideBar-foreground)' }}>
        {label}
      </span>
    </div>
    {badge !== undefined && (
      <span style={{
        fontSize: '10px', fontWeight: 700, minWidth: '16px', height: '16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '8px', padding: '0 4px',
        background: 'var(--vscode-badge-background)',
        color: 'var(--vscode-badge-foreground)',
      }}>
        {badge}
      </span>
    )}
  </div>
);

interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      height: '100%', background: 'none', border: 'none', cursor: 'pointer',
      fontSize: '12px', padding: '0 2px',
      fontWeight: active ? 600 : 400,
      color: active ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)',
      borderBottom: `2px solid ${active ? 'var(--vscode-settings-headerForeground, var(--vscode-focusBorder))' : 'transparent'}`,
      transition: 'all 0.15s',
    }}
  >
    {label}
  </button>
);

const footerBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
  borderRadius: '3px', color: 'var(--vscode-descriptionForeground)',
  display: 'flex', alignItems: 'center',
};

export default App;
