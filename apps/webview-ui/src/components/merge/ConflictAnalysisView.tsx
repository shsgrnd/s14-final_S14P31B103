import React from 'react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { ConflictAnalysis } from '@gitcat/shared-types';

/**
 * ConflictAnalysisView 컴포넌트
 * 병합 전 충돌 가능구간을 요약하여 리스트로 보여주는 사이드바 컴포넌트입니다.
 * 에디터 본문의 Decoration을 보조하여 유저가 전체 위험도를 파악하게 돕습니다.
 */
export const ConflictAnalysisView: React.FC = () => {
  const { conflicts, isAnalyzing } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();

  const handleFocusConflict = (conflict: ConflictAnalysis) => {
    // 에디터에서 해당 위치로 이동 요청
    sendMessage('OPEN_FILE_DIFF', { 
      filePath: conflict.filePath
    });
  };

  return (
    <div className="flex flex-col h-full bg-[var(--vscode-sideBar-background)] border-t border-[var(--vscode-panel-border)]">
      <div className="px-4 py-2 flex justify-between items-center border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBarSectionHeader-background)]">
        <h2 className="text-[11px] font-bold uppercase tracking-tight opacity-80">병합 위험 분석</h2>
        {isAnalyzing && (
          <div className="w-3 h-3 border-2 border-t-transparent border-blue-500 rounded-full animate-spin" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!isAnalyzing && conflicts.length === 0 ? (
          <div className="p-6 text-center text-[11px] opacity-40">
            분석된 충돌 위험 구간이 없습니다.
          </div>
        ) : (
          <div className="flex flex-col">
            {conflicts.map((conflict, idx) => (
              <ConflictItem 
                key={`${conflict.filePath}-${idx}`} 
                conflict={conflict} 
                onClick={() => handleFocusConflict(conflict)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ConflictItem: React.FC<{ 
  conflict: ConflictAnalysis; 
  onClick: () => void;
}> = ({ conflict, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="group px-4 py-2.5 border-b border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-1">
        <SeverityIcon severity={conflict.severity} />
        <span className="text-[11px] font-medium truncate opacity-90">{conflict.filePath.split('/').pop()}</span>
        <span className="text-[10px] opacity-40 italic">L{conflict.lineRange[0]}</span>
      </div>
      
      <p className="text-[10px] leading-relaxed opacity-60 line-clamp-2 mb-1">
        {conflict.reason}
      </p>

      {conflict.suggestion && (
        <div className="mt-1.5 p-1.5 rounded bg-[var(--vscode-editor-inactiveSelectionBackground)] border-l-2 border-blue-500">
          <p className="text-[9px] text-blue-400 font-semibold mb-0.5">💡 AI 제안</p>
          <p className="text-[9px] opacity-70 italic truncate">
            {conflict.suggestion}
          </p>
        </div>
      )}
    </div>
  );
};

const SeverityIcon: React.FC<{ severity: ConflictAnalysis['severity'] }> = ({ severity }) => {
  const colorClass = severity === 'high' ? 'bg-red-500' : severity === 'medium' ? 'bg-orange-500' : 'bg-blue-500';
  return <div className={`w-1.5 h-1.5 rounded-full ${colorClass}`} />;
};
