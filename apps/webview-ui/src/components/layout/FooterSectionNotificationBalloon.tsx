import React from 'react';
import { useGitCatStore, type NotificationSection } from '../../store/useGitCatStore';
import { SectionNotificationBanner } from '../common/SectionNotificationBanner';
import { t } from '../../i18n';

const BALLOON_SECTION_AUTO_HIDE_MS = 8000;

export interface FooterSectionNotificationBalloonProps {
  paintVisible: boolean;
}

export const FooterSectionNotificationBalloon: React.FC<FooterSectionNotificationBalloonProps> = ({
  paintVisible,
}) => {
  const sectionLabels: Record<NotificationSection, string> = {
    git: t('sidebar.section.git'),
    files: t('sidebar.section.files'),
    snapshots: t('sidebar.section.snapshots'),
    branchCleanup: t('sidebar.section.branchCleanup'),
    stash: t('sidebar.section.gitStash'),
  };
  const sectionNotifications = useGitCatStore((state) => state.sectionNotifications);
  const clearSectionNotification = useGitCatStore((state) => state.clearSectionNotification);

  const entries = Object.entries(sectionNotifications) as [
    NotificationSection,
    NonNullable<(typeof sectionNotifications)[NotificationSection]>,
  ][];

  if (entries.length === 0) return null;

  const hidden = !paintVisible;

  return (
    <div
      role="dialog"
      aria-hidden={hidden}
      aria-label={t('sidebar.alerts')}
      style={{
        position: 'absolute',
        left: 8,
        right: 8,
        bottom: '100%',
        marginBottom: hidden ? 0 : 8,
        width: 'auto',
        maxHeight: hidden ? 0 : 'min(52vh, 420px)',
        overflowY: hidden ? 'hidden' : 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        padding: hidden ? 0 : '10px 10px 8px 10px',
        borderRadius: 8,
        border: hidden ? 'none' : '1px solid var(--vscode-panel-border)',
        background: hidden ? 'transparent' : 'var(--vscode-editor-background)',
        color: 'var(--vscode-editor-foreground)',
        boxShadow: hidden ? 'none' : '0 -4px 24px rgba(0,0,0,0.35)',
        zIndex: 60,
        opacity: hidden ? 0 : 1,
        visibility: hidden ? 'hidden' : 'visible',
        pointerEvents: hidden ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 8,
          opacity: 0.85,
        }}
      >
        {t('sidebar.alerts')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(([section, notification]) => (
          <div key={section}>
            <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 4, opacity: 0.75 }}>
              {sectionLabels[section]}
            </div>
            <SectionNotificationBanner
              notification={notification}
              onDismiss={() => clearSectionNotification(section)}
              autoHideMs={BALLOON_SECTION_AUTO_HIDE_MS}
              dense
            />
          </div>
        ))}
      </div>
    </div>
  );
};
