import React, { createContext, useContext, useMemo } from 'react';

/**
 * PR 환경설정 드로어·브랜치 정리「자동 정리 구성」처럼 하위 화면에 들어간 경우에는
 * 섹션별 배너를 기존처럼 패널 안에 그대로 둔다.
 * 그 외에는 섹션 알림을 푸터 알림 아이콘 말풍선으로 모은다.
 */
export type SidebarSectionNotificationContextValue = {
  /** true: Git&AI·Files 등에 SectionNotificationBanner 표시 */
  showSectionBannersInline: boolean;
};

const SidebarSectionNotificationContext = createContext<SidebarSectionNotificationContextValue>({
  showSectionBannersInline: true,
});

export function useSidebarSectionNotificationMode(): SidebarSectionNotificationContextValue {
  return useContext(SidebarSectionNotificationContext);
}

export const SidebarSectionNotificationProvider: React.FC<{
  prSettingsOpen: boolean;
  branchCleanupInSettingsMode: boolean;
  children: React.ReactNode;
}> = ({ prSettingsOpen, branchCleanupInSettingsMode, children }) => {
  const value = useMemo<SidebarSectionNotificationContextValue>(
    () => ({
      showSectionBannersInline: prSettingsOpen || branchCleanupInSettingsMode,
    }),
    [prSettingsOpen, branchCleanupInSettingsMode],
  );
  return (
    <SidebarSectionNotificationContext.Provider value={value}>
      {children}
    </SidebarSectionNotificationContext.Provider>
  );
};
