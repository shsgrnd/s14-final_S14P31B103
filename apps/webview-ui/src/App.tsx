import React, { useEffect, useRef, useState } from 'react';
import { useGitCatStore } from './store/useGitCatStore';
import { sendMessage } from './hooks/useVsCodeApi';
import { useViewMode } from './app/ViewModeContext';
import { SidebarLayout } from './components/layout/SidebarLayout';
import { MainPanelLayout } from './components/layout/MainPanelLayout';
import { LoadingFallback } from './components/common/LoadingFallback';

const AUTO_STATUS_REFRESH_INTERVAL_MS = 20_000;

// GITCAT_LOGO_URI는 LoadingFallback에서 사용하므로 여기서 타입 선언 유지
declare global {
  interface Window {
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
  const { handleMessage, currentBranch } = useGitCatStore();
  const initialFetchDone = useRef(false);

  const isGitConnected = currentBranch !== '';

  const [showInitialSplash, setShowInitialSplash] = useState(true);
  const [isSlowBoot, setIsSlowBoot] = useState(false);

  // ── 메시지 리스너 등록 ──
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // ── 초기 데이터 fetch (마운트 시 상태 확인 및 연결 시 데이터 fetch) ──
  useEffect(() => {
    // 1. 아직 한 번도 상태를 물어보지 않았다면 상태 확인 요청 (연결 여부 파악용)
    if (!initialFetchDone.current) {
      sendMessage('REFRESH_STATUS', {});
    }

    // 2. 이미 데이터를 가져왔거나 아직 Git이 연결되지 않았다면 중단
    if (initialFetchDone.current || !isGitConnected) return;

    // 3. 연결된 것이 확인되면 나머지 데이터(스냅샷, 브랜치 등)를 가져옴
    initialFetchDone.current = true;
    sendMessage('GET_SNAPSHOT_LIST', {});
    sendMessage('REFRESH_STATUS', { fetchRemote: true });
    sendMessage('GET_BRANCH_LIST', {});
    sendMessage('GET_STASH_LIST', {}); // 스태시 목록도 함께 요청
  }, [isGitConnected]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      sendMessage('REFRESH_STATUS', { fetchRemote: true });
    }, AUTO_STATUS_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(refreshTimer);
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

  // window.VIEW_MODE 직접 참조 대신 Context Hook 사용
  const viewMode = useViewMode();

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
