import React from 'react';

/** 지연 로드되는 패널용 최소 높이 스켈레톤 */
export const SectionLoading: React.FC<{ label?: string }> = ({ label = '불러오는 중…' }) => (
  <div
    style={{
      padding: '12px 14px',
      fontSize: '12px',
      color: 'var(--vscode-descriptionForeground, var(--vscode-sideBar-foreground))',
      minHeight: '48px',
      boxSizing: 'border-box',
    }}
  >
    {label}
  </div>
);
