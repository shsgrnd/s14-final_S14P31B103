import React, { useState } from 'react';
import { AIDraftPanel } from '../merge/AIDraftPanel';
import { ConflictAnalysisView } from '../merge/ConflictAnalysisView';
import { CommitEditor } from '../commit/CommitEditor';
import { TabButton } from '../common/TabButton';

type MainView = 'draft' | 'commit';

/**
 * 메인 패널(상세 팝업) 전체 레이아웃 컴포넌트
 *
 * 역할:
 * - 상단 탭(AI 병합 중재안 / 커밋 에디터) 렌더링
 * - 탭에 따른 콘텐츠 전환
 * - activeMainView 상태를 이 컴포넌트 안에서 완결
 */
export const MainPanelLayout: React.FC = () => {
  const [activeMainView, setActiveMainView] = useState<MainView>('draft');

  return (
    <div style={{
      height: '100vh', width: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
    }}>
      {/* ── Tab Header ── */}
      <header style={{
        height: '35px', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '16px',
        borderBottom: '1px solid var(--vscode-panel-border)',
        flexShrink: 0,
      }}>
        <TabButton
          label="AI 병합 중재안"
          active={activeMainView === 'draft'}
          onClick={() => setActiveMainView('draft')}
        />
        <TabButton
          label="커밋 에디터"
          active={activeMainView === 'commit'}
          onClick={() => setActiveMainView('commit')}
        />
      </header>

      {/* ── Content Area ── */}
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
};
