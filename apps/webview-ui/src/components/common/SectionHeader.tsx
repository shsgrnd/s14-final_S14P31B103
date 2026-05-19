import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { vscodeSidebarViewTitleForeground } from '../../shared/styles';

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
      padding: '3px 8px', cursor: 'pointer', userSelect: 'none',
      borderBottom: '1px solid var(--vscode-panel-border)',
      // flex 컨테이너 내에서 헤더가 줄어들지 않도록 고정
      flexShrink: 0,
    }}
    onMouseOver={e => (e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)')}
    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {expanded
        ? (
          <ChevronDown
            size={10}
            style={{
              color: vscodeSidebarViewTitleForeground,
              opacity: 0.82,
              flexShrink: 0,
            }}
          />
        )
        : (
          <ChevronRight
            size={10}
            style={{
              color: vscodeSidebarViewTitleForeground,
              opacity: 0.82,
              flexShrink: 0,
            }}
          />
        )}
      <span style={{
        fontSize: '11px',
        fontWeight: 700,
        color: vscodeSidebarViewTitleForeground,
      }}>
        {label}
      </span>
    </div>
    {badge !== undefined && (
      <span style={{
        fontSize: '9px', fontWeight: 700, minWidth: '12px', height: '12px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '6px', padding: '0 3px',
        background: 'var(--vscode-badge-background)',
        color: 'var(--vscode-badge-foreground)',
      }}>
        {badge}
      </span>
    )}
  </div>
);
