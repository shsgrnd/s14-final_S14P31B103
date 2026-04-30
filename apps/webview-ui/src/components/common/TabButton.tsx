import React from 'react';

export interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

/**
 * 메인 패널 상단 탭 버튼 컴포넌트
 * - active 상태에 따라 폰트 굵기와 하단 보더 색상 변경
 */
export const TabButton: React.FC<TabButtonProps> = ({ label, active, onClick }) => (
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
