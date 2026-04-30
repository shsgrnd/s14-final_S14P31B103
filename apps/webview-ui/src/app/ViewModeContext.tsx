import React, { createContext, useContext } from 'react';

/**
 * ViewMode 타입
 * - 'sidebar': VS Code 사이드바에 마운트되는 경우 (SidebarProvider)
 * - 'main': 별도 Webview 패널로 열리는 경우 (WebviewProvider)
 */
export type ViewMode = 'sidebar' | 'main';

const ViewModeContext = createContext<ViewMode>('sidebar');

interface ViewModeProviderProps {
  mode: ViewMode;
  children: React.ReactNode;
}

/**
 * ViewModeProvider
 *
 * main.tsx에서 window.VIEW_MODE를 한 번만 읽고 Context로 주입합니다.
 * 이렇게 하면 하위 컴포넌트들은 window 객체를 직접 참조하지 않아도 됩니다.
 *
 * @example
 * // main.tsx
 * const mode = (window as any).VIEW_MODE ?? 'sidebar';
 * <ViewModeProvider mode={mode}>
 *   <App />
 * </ViewModeProvider>
 */
export const ViewModeProvider: React.FC<ViewModeProviderProps> = ({ mode, children }) => (
  <ViewModeContext.Provider value={mode}>
    {children}
  </ViewModeContext.Provider>
);

/**
 * useViewMode Hook
 *
 * 현재 렌더링 모드(sidebar / main)를 반환합니다.
 * window.VIEW_MODE를 컴포넌트에서 직접 참조하는 대신 이 훅을 사용합니다.
 *
 * @example
 * const viewMode = useViewMode();
 * if (viewMode === 'sidebar') { ... }
 */
export const useViewMode = (): ViewMode => useContext(ViewModeContext);
