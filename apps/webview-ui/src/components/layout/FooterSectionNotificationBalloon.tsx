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

/** 말풍선 내 배너 자동 해제(스토어에서 해당 섹션 알림 제거) */
const BALLOON_SECTION_AUTO_HIDE_MS = 8000;

export interface FooterSectionNotificationBalloonProps {
  /**
   * false여도 스토어에 섹션 알림이 있으면 컴포넌트는 마운트된 채로 유지한다.
   * (오류/알림 기록 모달을 연 동안 `SectionNotificationBanner`의 자동 해제 타이머가 끊기지 않도록)
   */
  paintVisible: boolean;
}

/**
 * 푸터 영역(좌우 여백 포함) 위에 뜨는 섹션 알림 말풍선.
 * 사이드바가 좁을 때 오른쪽 정렬만 하면 왼쪽이 잘리므로 left/right 인셋으로 너비를 잡는다.
 * 닫기: 일정 시간 후 자동 해제, 배너의 X(해당 섹션 알림만 해제). 패널 클릭으로는 닫히지 않는다.
 */
export const FooterSectionNotificationBalloon: React.FC<FooterSectionNotificationBalloonProps> = ({
  paintVisible,
}) => {
  const sectionNotifications = useGitCatStore((s) => s.sectionNotifications);
  const clearSectionNotification = useGitCatStore((s) => s.clearSectionNotification);

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
      aria-label="섹션 알림"
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
              autoHideMs={BALLOON_SECTION_AUTO_HIDE_MS}
              dense
            />
          </div>
        ))}
      </div>
    </div>
  );
};
