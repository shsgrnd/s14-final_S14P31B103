import React, { useEffect, useRef, useState } from 'react';
import { FileText, ListChecks, Download, Save, X, Sparkles } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';

export const CommitEditor: React.FC = () => {
  const { aiCommitSuggestion, aiCommitAlternatives, commitSuggestionNonce } = useGitCatStore();
  const [mode, setMode] = useState<'text' | 'form'>('text');
  const [commitMsg, setCommitMsg] = useState(aiCommitSuggestion);
  const latestNonceRef = useRef(0);

  useEffect(() => {
    if (commitSuggestionNonce === latestNonceRef.current) return;
    latestNonceRef.current = commitSuggestionNonce;
    if (aiCommitSuggestion.trim()) {
      setCommitMsg(aiCommitSuggestion);
    }
  }, [commitSuggestionNonce, aiCommitSuggestion]);

  return (
    <div className="h-full flex flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]">
      {/* Title & Tabs */}
      <div className="p-6 pb-2">
        <h1 className="text-2xl font-light mb-6">Commit message</h1>
        
        <div className="flex items-center space-x-6 border-b border-[var(--vscode-panel-border)]">
          <button 
            onClick={() => setMode('text')}
            className={`flex items-center pb-2 px-1 text-[13px] transition-colors relative ${mode === 'text' ? 'text-[var(--vscode-foreground)]' : 'text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]'}`}
          >
            <FileText size={14} className="mr-2" />
            Edit as text
            {mode === 'text' && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[var(--vscode-settings-headerForeground)]"></div>}
          </button>
          <button 
            onClick={() => setMode('form')}
            className={`flex items-center pb-2 px-1 text-[13px] transition-colors relative ${mode === 'form' ? 'text-[var(--vscode-foreground)]' : 'text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]'}`}
          >
            <ListChecks size={14} className="mr-2" />
            Edit as form
            {mode === 'form' && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[var(--vscode-settings-headerForeground)]"></div>}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 flex items-center justify-between">
        <button className="flex items-center text-[12px] text-[var(--vscode-textLink-foreground)] hover:underline">
          <Download size={14} className="mr-1.5" />
          Load template
        </button>
        <button 
          onClick={() => setCommitMsg(aiCommitSuggestion)}
          className="flex items-center text-[11px] px-2 py-1 rounded bg-[var(--vscode-charts-purple)] bg-opacity-20 text-[var(--vscode-charts-purple)] hover:bg-opacity-30 border border-[var(--vscode-charts-purple)] border-opacity-30"
        >
          <Sparkles size={12} className="mr-1.5" />
          AI 초안 반영
        </button>
      </div>

      {mode === 'text' && aiCommitAlternatives.length > 0 && (
        <div className="px-6 pb-2">
          <div className="text-[11px] font-bold text-[var(--vscode-descriptionForeground)] mb-2">대체 후보</div>
          <div className="flex flex-wrap gap-2">
            {aiCommitAlternatives.map((msg, idx) => (
              <button
                key={`${idx}-${msg.slice(0, 24)}`}
                type="button"
                onClick={() => setCommitMsg(msg)}
                title={msg}
                className="text-[11px] px-2 py-1 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] hover:bg-[var(--vscode-list-hoverBackground)]"
              >
                {msg.length > 42 ? `${msg.slice(0, 42)}...` : msg}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editor Area */}
      <div className="flex-1 px-6 pb-6 overflow-hidden flex flex-col">
        {mode === 'text' ? (
          <textarea 
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            className="flex-1 w-full p-4 rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-panel-border)] focus:outline-none focus:border-[var(--vscode-focusBorder)] font-mono text-[14px] resize-none custom-scrollbar"
            placeholder="커밋 메시지를 입력하세요..."
          />
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
             <div className="space-y-2">
                <label className="text-[12px] font-bold text-[var(--vscode-descriptionForeground)]">Type</label>
                <select className="w-full p-2 bg-[var(--vscode-dropdown-background,var(--vscode-input-background))] text-[var(--vscode-dropdown-foreground,var(--vscode-input-foreground))] border border-[var(--vscode-panel-border)] outline-none rounded">
                  <option>feat</option>
                  <option>fix</option>
                  <option>docs</option>
                  <option>refactor</option>
                </select>
             </div>
             <div className="space-y-2">
                <label className="text-[12px] font-bold text-[var(--vscode-descriptionForeground)]">Subject</label>
                <input className="w-full p-2 bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)] outline-none rounded" placeholder="간결한 제목을 입력하세요" />
             </div>
             <div className="space-y-2">
                <label className="text-[12px] font-bold text-[var(--vscode-descriptionForeground)]">Description</label>
                <textarea className="w-full h-32 p-2 bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)] outline-none rounded resize-none" placeholder="상세한 설명을 입력하세요" />
             </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex items-center space-x-3">
          <button className="px-6 py-1.5 bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)] rounded flex items-center">
            <Save size={14} className="mr-2" />
            Save
          </button>
          <button className="px-6 py-1.5 bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)] rounded flex items-center border border-[var(--vscode-panel-border)]">
            <X size={14} className="mr-2" />
            Close
          </button>
        </div>

        {/* Footer info */}
        <div className="mt-8 pt-6 border-t border-[var(--vscode-panel-border)] space-y-3">
          <div className="text-[12px] font-bold text-[var(--vscode-descriptionForeground)]">Recent commits:</div>
          <div className="space-y-2">
             {[
               { icon: <Sparkles size={12} />, title: "Preps v9.9.3", date: "어제" },
               { icon: <Sparkles size={12} />, title: "Polishes new add remote support", date: "2일 전" },
               { icon: <Sparkles size={12} />, title: "Adds add new remote support", date: "3일 전" },
             ].map((item, idx) => (
                <div key={idx} className="flex items-center text-[12px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] cursor-pointer">
                   <span className="mr-2 opacity-50">{item.icon}</span>
                   <span className="flex-1 truncate">{item.title}</span>
                   <span className="ml-2 text-[10px] opacity-40">{item.date}</span>
                </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
};
