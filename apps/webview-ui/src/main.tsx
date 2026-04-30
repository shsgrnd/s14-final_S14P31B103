import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ViewModeProvider, type ViewMode } from './app/ViewModeContext';
import './styles/globals.css';

// window.VIEW_MODE를 앱 진입점에서 단 한 번만 읽습니다.
// 이 값은 VS Code Extension이 Webview HTML을 생성할 때 주입합니다.
const viewMode: ViewMode = (window as Window & { VIEW_MODE?: ViewMode }).VIEW_MODE ?? 'sidebar';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ViewModeProvider mode={viewMode}>
      <App />
    </ViewModeProvider>
  </React.StrictMode>
);

