import React, { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { GlobalNotification } from '../../store/useGitCatStore';

interface SectionNotificationBannerProps {
  notification: GlobalNotification | null | undefined;
  onDismiss: () => void;
  autoHideMs?: number;
  /** 말풍선 등 좁은 컨테이너 — 좌우 마진 생략 */
  dense?: boolean;
}

export const SectionNotificationBanner: React.FC<SectionNotificationBannerProps> = ({
  notification,
  onDismiss,
  autoHideMs = 5000,
  dense = false,
}) => {
  /** 부모 리렌더마다 onDismiss 참조가 바뀌면 타이머가 끊기거나 이상 동작하므로 ref로 고정 */
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  /** 알림 내용이 바뀌면 타이머를 다시 잡기 위해 문자열 키 사용 */
  const notificationKey =
    notification == null ? '' : `${notification.type}:${notification.message}`;

  useEffect(() => {
    if (!notification || autoHideMs <= 0) return;
    const timer = setTimeout(() => {
      onDismissRef.current();
    }, autoHideMs);
    return () => clearTimeout(timer);
  }, [notificationKey, autoHideMs]);

  if (!notification) return null;

  const green = 'var(--vscode-charts-green)';
  const linkFg = 'var(--vscode-textLink-foreground, #6fb3e0)';
  const border =
    notification.type === 'error'
      ? 'var(--vscode-inputValidation-errorBorder)'
      : notification.type === 'warning'
        ? 'var(--vscode-inputValidation-warningBorder)'
        : notification.type === 'success'
          ? green
          : notification.type === 'info'
            ? linkFg
            : 'var(--vscode-focusBorder)';
  const background =
    notification.type === 'error'
      ? 'var(--vscode-inputValidation-errorBackground)'
      : notification.type === 'warning'
        ? 'var(--vscode-inputValidation-warningBackground)'
        : notification.type === 'success'
          ? 'rgba(78, 201, 176, 0.1)'
          : notification.type === 'info'
            ? 'rgba(120, 190, 255, 0.16)'
            : 'var(--vscode-inputValidation-infoBackground)';
  const color =
    notification.type === 'error'
      ? 'var(--vscode-errorForeground)'
      : notification.type === 'success'
        ? green
        : notification.type === 'warning'
          ? 'var(--vscode-editorWarning-foreground)'
          : notification.type === 'info'
            ? linkFg
            : 'var(--vscode-foreground)';

  return (
    <div
      style={{
        margin: dense ? '0 0 8px 0' : '0 8px 8px 8px',
        padding: '8px 10px',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        borderRadius: '3px',
        border: `1px solid ${border}`,
        background,
        color,
      }}
    >
      {notification.type === 'error' ? (
        <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
      ) : notification.type === 'success' ? (
        <CheckCircle2 size={13} style={{ flexShrink: 0, marginTop: '1px', color: green }} />
      ) : notification.type === 'info' ? (
        <Info size={13} style={{ flexShrink: 0, marginTop: '1px', color: linkFg }} />
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
