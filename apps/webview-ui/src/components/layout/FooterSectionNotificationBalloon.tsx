import React from 'react';
import { useGitCatStore, type NotificationSection } from '../../store/useGitCatStore';
import { SectionNotificationBanner } from '../common/SectionNotificationBanner';

const SECTION_LABELS: Record<NotificationSection, string> = {
  git: 'Git & AI',
  files: 'Files',
  snapshots: 'Snapshots',
  branchCleanup: 'Branch cleanup',
  stash: 'Git Stash',
};

export interface FooterSectionNotificationBalloonProps {
  open: boolean;
}

/**
 * 푸터 영역(좌우 여백 포함) 위에 뜨는 섹션 알림 말풍선.
 * 사이드바가 좁을 때 오른쪽 정렬만 하면 왼쪽이 잘리므로 left/right 인셋으로 너비를 잡는다.
 * 닫기: 푸터 알림 아이콘 토글 또는 배너의 X(섹션 알림 해제)만 사용한다. 패널 클릭으로는 닫히지 않는다.
 */
export const FooterSectionNotificationBalloon: React.FC<FooterSectionNotificationBalloonProps> = ({
  open,
}) => {
  const sectionNotifications = useGitCatStore((s) => s.sectionNotifications);
  const clearSectionNotification = useGitCatStore((s) => s.clearSectionNotification);

  const entries = Object.entries(sectionNotifications) as [
    NotificationSection,
    NonNullable<(typeof sectionNotifications)[NotificationSection]>,
  ][];

  if (!open || entries.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-label="섹션 알림"
      style={{
        position: 'absolute',
        left: 8,
        right: 8,
        bottom: '100%',
        marginBottom: 8,
        width: 'auto',
        maxHeight: 'min(52vh, 420px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        padding: '10px 10px 8px 10px',
        borderRadius: 8,
        border: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-editor-background)',
        color: 'var(--vscode-editor-foreground)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.35)',
        zIndex: 60,
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
        섹션 알림
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(([section, notification]) => (
          <div key={section}>
            <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 4, opacity: 0.75 }}>
              {SECTION_LABELS[section]}
            </div>
            <SectionNotificationBanner
              notification={notification}
              onDismiss={() => clearSectionNotification(section)}
              autoHideMs={0}
              dense
            />
          </div>
        ))}
      </div>
    </div>
  );
};
