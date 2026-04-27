import React, { useEffect } from 'react';
import { useGitCatStore } from './store/useGitCatStore';
import { useVsCodeApi } from './hooks/useVsCodeApi';

export const App: React.FC = () => {
  const { currentBranch } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();

  useEffect(() => {
    // 마운트 시 초기 데이터 요청 테스트
    sendMessage('GET_SNAPSHOTS', undefined);
  }, [sendMessage]);

  return (
    <div style={{ padding: '20px', color: 'var(--vscode-foreground)' }}>
      <h2>GitCat Webview UI 🚀</h2>
      <p>현재 상태 관리, 통신 훅, CSS 디자인 시스템이 정상적으로 연결되었습니다.</p>
      <p>현재 브랜치: {currentBranch}</p>
    </div>
  );
};

export default App;
