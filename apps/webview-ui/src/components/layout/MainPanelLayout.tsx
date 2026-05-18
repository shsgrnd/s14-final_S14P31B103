import React from 'react';
import { MergeReviewPanel } from '../merge/MergeReviewPanel';

/**
 * 메인 패널(에디터 영역) 레이아웃.
 * 병합 충돌 감지 시 자동으로 열리며, AI 병합 중재안 전용 패널로 동작한다.
 */
export const MainPanelLayout: React.FC = () => {
  return (
    <div style={{
      height: '100vh', width: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
      overflow: 'hidden',
    }}>
      <MergeReviewPanel variant="main" showWhenIdle />
    </div>
  );
};
