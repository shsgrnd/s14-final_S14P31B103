import React from 'react';
import { t } from '../../i18n';

export const SectionLoading: React.FC<{ label?: string }> = ({ label = t('loading.panel') }) => (
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
