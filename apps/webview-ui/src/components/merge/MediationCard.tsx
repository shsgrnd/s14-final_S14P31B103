import React from 'react';

interface MediationCardProps {
  reason: string;
  opinion: string;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * MediationCard 컴포넌트
 * AI가 왜 이런 병합 초안을 제안했는지 설명하고, 사용자의 승인을 유도하는 카드 UI입니다.
 */
export const MediationCard: React.FC<MediationCardProps> = ({ reason, opinion, onApprove, onReject }) => {
  return (
    <div className="bg-[var(--vscode-editorWidget-background)] border border-[var(--vscode-panel-border)] rounded-xl p-5 shadow-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
            <path d="M12 8v4l3 3"/>
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-bold text-[var(--vscode-editor-foreground)]">AI 병합 중재 의견</h3>
          <p className="text-[11px] opacity-50 uppercase tracking-tighter">GitCat Smart Mediation</p>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <section>
          <h4 className="text-[11px] font-semibold text-blue-400 mb-1">충돌 원인 분석</h4>
          <p className="text-xs leading-relaxed opacity-80 bg-[var(--vscode-input-background)] p-3 rounded-lg border border-[var(--vscode-panel-border)]">
            {reason}
          </p>
        </section>

        <section>
          <h4 className="text-[11px] font-semibold text-green-400 mb-1">AI 중재 제안 방향</h4>
          <p className="text-xs leading-relaxed opacity-80 border-l-2 border-green-500 pl-3">
            {opinion}
          </p>
        </section>
      </div>

      <div className="flex gap-3">
        <button 
          onClick={onReject}
          className="flex-1 py-1.5 text-xs font-medium border border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-button-secondaryBackground)] rounded-lg transition-all"
        >
          거절 및 직접 수정
        </button>
        <button 
          onClick={onApprove}
          className="flex-1 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-lg shadow-blue-900/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
        >
          AI 중재안 반영하기
        </button>
      </div>
    </div>
  );
};
