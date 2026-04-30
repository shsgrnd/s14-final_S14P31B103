import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface SectionHeaderProps {
  label: string;
  expanded: boolean;
  badge?: number;
  onToggle: () => void;
}

/**
 * 사이드바 아코디언 섹션의 헤더 컴포넌트
 * - 클릭 시 섹션 열기/닫기 토글
 * - badge prop으로 숫자 배지 표시 가능 (0이면 미표시)
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({ label, expanded, badge, onToggle }) => (
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
