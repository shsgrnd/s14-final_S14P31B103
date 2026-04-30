import React, { useEffect, useRef, useState } from 'react';
import { useGitCatStore } from './store/useGitCatStore';
import { sendMessage } from './hooks/useVsCodeApi';
import { SidebarLayout } from './components/layout/SidebarLayout';
import { MainPanelLayout } from './components/layout/MainPanelLayout';
import { LoadingFallback } from './components/common/LoadingFallback';

// window 전역 변수 타입 선언 (VS Code Webview에서 주입됨)
declare global {
  interface Window {
    VIEW_MODE: 'sidebar' | 'main';
    GITCAT_LOGO_URI?: string;
  }
}

/**
 * App Component — GitCat WebView 메인 엔트리 포인트
 *
 * 역할:
 * 1. VS Code Extension → Webview 메시지 리스너 등록
 * 2. 초기 데이터 fetch 요청 (스냅샷, 브랜치 목록)
 * 3. 로딩 스플래시 타이머 관리
 * 4. VIEW_MODE에 따라 SidebarLayout / MainPanelLayout으로 라우팅
 *
 * UI 로직은 각 레이아웃 컴포넌트가 담당합니다.
 */
function App() {
  const handleMessage = useGitCatStore(state => state.handleMessage);
  const initialFetchDone = useRef(false);

  const [showInitialSplash, setShowInitialSplash] = useState(true);
  const [isSlowBoot, setIsSlowBoot] = useState(false);

  // ── 메시지 리스너 등록 ──
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // ── 초기 데이터 fetch (마운트 1회) ──
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    sendMessage('GET_SNAPSHOT_LIST', {});
    sendMessage('GET_BRANCH_LIST', {});
  }, []);

  // ── 로딩 스플래시 타이머 ──
  useEffect(() => {
    const splashTimer = window.setTimeout(() => setShowInitialSplash(false), 900);
    const slowBootTimer = window.setTimeout(() => setIsSlowBoot(true), 3000);
    return () => {
      window.clearTimeout(splashTimer);
      window.clearTimeout(slowBootTimer);
    };
  }, []);

  const viewMode = window.VIEW_MODE ?? 'sidebar';

  // ── 사이드바 모드 ──
  if (viewMode === 'sidebar') {
    if (showInitialSplash) {
      return <LoadingFallback isSlowBoot={isSlowBoot} />;
    }
    return <SidebarLayout />;
  }

  // ── 메인 패널 모드 ──
  return <MainPanelLayout />;
}

export default App;
