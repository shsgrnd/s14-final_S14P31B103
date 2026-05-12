import React from 'react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { Check, X, Edit3, ShieldCheck, Info, AlertTriangle } from 'lucide-react';

export const AIDraftPanel: React.FC = () => {
  const { currentAIDraft, setAIDraft } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();

  if (!currentAIDraft) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-12 opacity-40">
        <ShieldCheck size={48} className="mb-4" />
        <h2 className="text-lg font-bold">병합 분석 대기 중</h2>
        <p className="text-sm mt-2 max-w-xs leading-relaxed">
          사이드바에서 병합 분석을 시작하거나 분석된 파일을 선택하면 이곳에 AI 중재안이 표시됩니다.
        </p>
      </div>
    );
  }

  const handleApprove = () => {
    // 병합안 수락은 proposalId 기준의 표준 메시지로 전송합니다.
    sendMessage('ACCEPT_MERGE', {
      proposalId: currentAIDraft.proposalId,
      candidateId: currentAIDraft.candidateId,
      filePath: currentAIDraft.filePath,
      proposedContent: currentAIDraft.proposedContent,
      finalExplanation: currentAIDraft.explanation,
    });
    setAIDraft(null);
  };

  const handleReject = () => {
    // AI 초안 거절도 REJECT_MERGE 하나로 통일합니다.
    sendMessage('REJECT_MERGE', {
      proposalId: currentAIDraft.proposalId,
      candidateId: currentAIDraft.candidateId,
      filePath: currentAIDraft.filePath,
    });
    setAIDraft(null);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)] animate-fade-in">
      {/* Top Banner: Status & Actions */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--vscode-sideBarSectionHeader-background)]">
        <div className="flex items-center space-x-3 min-w-0">
          <span className="px-2 py-0.5 rounded bg-[var(--vscode-charts-purple)] bg-opacity-20 text-[var(--vscode-charts-purple)] text-[10px] font-bold uppercase tracking-widest shrink-0">AI Mediation</span>
          <h1 className="text-[13px] font-bold truncate">{currentAIDraft.filePath}</h1>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleReject}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[var(--secondary)] hover:bg-[var(--secondary-hover)] text-[11px] font-bold transition-all"
          >
            <X size={14} />
            <span>반영 안 함</span>
          </button>
          <button className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[var(--secondary)] hover:bg-[var(--secondary-hover)] text-[11px] font-bold transition-all">
            <Edit3 size={14} />
            <span>수정 후 반영</span>
          </button>
          <button
            onClick={handleApprove}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-foreground)] text-[11px] font-bold shadow-lg transition-all"
          >
            <Check size={14} />
            <span>최종 반영</span>
          </button>
        </div>
      </div>

      {/* 3-Column Code View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Incoming (Theirs) */}
        <div className="flex-1 flex flex-col border-r border-[var(--border)] min-w-0">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase bg-[var(--vscode-editor-lineHighlightBackground)] text-[var(--vscode-charts-blue)] flex items-center">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-charts-blue)] mr-2" />
            상대 변경사항 (Incoming)
          </div>
          <div className="flex-1 p-4 font-mono text-[12px] overflow-auto custom-scrollbar opacity-60">
            <pre className="leading-5">{currentAIDraft.targetContent || '// No incoming changes detected'}</pre>
          </div>
        </div>

        {/* Column 2: Current (Ours) */}
        <div className="flex-1 flex flex-col border-r border-[var(--border)] min-w-0">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase bg-[var(--vscode-editor-lineHighlightBackground)] text-[var(--vscode-charts-green)] flex items-center">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-charts-green)] mr-2" />
            내 변경사항 (Current)
          </div>
          <div className="flex-1 p-4 font-mono text-[12px] overflow-auto custom-scrollbar opacity-60">
            <pre className="leading-5">{currentAIDraft.sourceContent || '// No local changes detected'}</pre>
          </div>
        </div>

        {/* Column 3: AI Draft (Mediation) */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--vscode-editor-lineHighlightBackground)] bg-opacity-30">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase bg-[var(--vscode-charts-purple)] bg-opacity-10 text-[var(--vscode-charts-purple)] flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-charts-purple)] mr-2 animate-pulse" />
              AI 병합 초안 (Result)
            </div>
            <ShieldCheck size={12} />
          </div>
          <div className="flex-1 p-4 font-mono text-[12px] overflow-auto custom-scrollbar relative">
            <pre className="leading-5">{currentAIDraft.proposedContent}</pre>

            {/* Inline AI Opinion Floating Card */}
            <div className="absolute bottom-4 left-4 right-4 p-4 rounded-lg bg-[var(--card)] border border-[var(--vscode-charts-purple)] border-opacity-30 shadow-2xl animate-fade-in">
              <div className="flex items-start space-x-3">
                <div className="p-1.5 rounded bg-[var(--vscode-charts-purple)] bg-opacity-10 text-[var(--vscode-charts-purple)]">
                  <Info size={16} />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="text-[11px] font-bold">AI 중재 근거</div>
                  <p className="text-[11px] leading-relaxed opacity-80 italic">
                    "{currentAIDraft.explanation || '코드의 중복성을 제거하고 공통 타입 정의를 우선적으로 적용했습니다.'}"
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Static Analysis Warning (Optional/Conditional) */}
      <div className="px-6 py-2 bg-[var(--vscode-editorMarkerNavigationError-background)] bg-opacity-10 border-t border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center space-x-2 text-[11px] text-[var(--vscode-errorForeground)]">
          <AlertTriangle size={14} />
          <span>코드 분석 결과: <span className="font-bold underline cursor-pointer">2개의 정적 분석 경고</span>가 초안에 포함되어 있습니다.</span>
        </div>
        <button className="text-[10px] uppercase font-bold opacity-60 hover:opacity-100">Details</button>
      </div>
    </div>
  );
};
