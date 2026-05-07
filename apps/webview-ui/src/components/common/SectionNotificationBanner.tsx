import React, { useEffect } from 'react';
import { AlertCircle, Info, X } from 'lucide-react';
import type { GlobalNotification } from '../../store/useGitCatStore';

interface SectionNotificationBannerProps {
  notification: GlobalNotification | null | undefined;
  onDismiss: () => void;
  autoHideMs?: number;
}

export const SectionNotificationBanner: React.FC<SectionNotificationBannerProps> = ({
  notification,
  onDismiss,
  autoHideMs = 5000,
}) => {
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(onDismiss, autoHideMs);
    return () => clearTimeout(timer);
  }, [notification, onDismiss, autoHideMs]);

  if (!notification) return null;

  return (
    <div
      style={{
        margin: '0 8px 8px 8px',
        padding: '8px 10px',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        borderRadius: '3px',
        border: `1px solid ${notification.type === 'error'
          ? 'var(--vscode-inputValidation-errorBorder)'
          : notification.type === 'warning'
            ? 'var(--vscode-inputValidation-warningBorder)'
            : 'var(--vscode-focusBorder)'
          }`,
        background: `${notification.type === 'error'
          ? 'var(--vscode-inputValidation-errorBackground)'
          : notification.type === 'warning'
            ? 'var(--vscode-inputValidation-warningBackground)'
            : 'var(--vscode-inputValidation-infoBackground)'
          }`,
        color: `${notification.type === 'error'
          ? 'var(--vscode-errorForeground)'
          : 'var(--vscode-foreground)'
          }`,
      }}
    >
      {notification.type === 'error' ? (
        <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
      ) : (
        <Info size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
      )}
      <span style={{ flex: 1, lineHeight: 1.4 }}>{notification.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0',
          color: 'inherit',
          opacity: 0.7,
          flexShrink: 0,
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
};
