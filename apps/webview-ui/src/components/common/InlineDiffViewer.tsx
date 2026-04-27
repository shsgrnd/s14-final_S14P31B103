import React from 'react';

interface InlineDiffViewerProps {
  original: string;
  proposed: string;
  onOpenNativeDiff?: () => void;
}

/**
 * InlineDiffViewer 컴포넌트
 * WebView 내부에서 변경 사항을 빠르게 확인할 수 있는 인라인 Diff UI입니다.
 * 단순 코드 비교를 넘어 VS Code 테마와 일치하는 가독성을 제공합니다.
 */
export const InlineDiffViewer: React.FC<InlineDiffViewerProps> = ({ original, proposed, onOpenNativeDiff }) => {
  // 단순화를 위해 라인별 비교 로직 (실제로는 정교한 diff 알고리즘 필요)
  const originalLines = original.split('\n');
  const proposedLines = proposed.split('\n');
  const maxLines = Math.max(originalLines.length, proposedLines.length);

  return (
    <div className="flex flex-col border border-[var(--vscode-panel-border)] rounded-lg overflow-hidden bg-[var(--vscode-editor-background)]">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-2 bg-[var(--vscode-editorWidget-background)] border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Preview Diff</span>
          <span className="text-[10px] opacity-40">WebView Inline View</span>
        </div>
        {onOpenNativeDiff && (
          <button 
            onClick={onOpenNativeDiff}
            className="text-[10px] px-2 py-1 bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)] rounded flex items-center gap-1.5 transition-colors"
          >
            <span>전체 비교 열기</span>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 1h13l.5.5v13l-.5.5h-13l-.5-.5v-13l.5-.5zM2 14h12V2H2v12zM4 4h8v1H4V4zm0 3h8v1H4V7zm0 3h5v1H4v-1z"/>
            </svg>
          </button>
        )}
      </div>

      {/* Diff Content */}
      <div className="p-0 font-mono text-[12px] leading-relaxed overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {Array.from({ length: maxLines }).map((_, i) => {
              const orig = originalLines[i];
              const prop = proposedLines[i];
              const isChanged = orig !== prop;

              return (
                <React.Fragment key={i}>
                  {/* Original Line (Red) if changed */}
                  {isChanged && orig !== undefined && (
                    <tr className="bg-red-500/10 hover:bg-red-500/20">
                      <td className="w-10 text-right pr-3 select-none opacity-30 text-red-500 border-r border-red-500/20">{i + 1}</td>
                      <td className="w-6 text-center select-none text-red-500/50">-</td>
                      <td className="pl-2 whitespace-pre text-red-200/80">{orig}</td>
                    </tr>
                  )}
                  {/* Proposed Line (Green) if changed or neutral */}
                  <tr className={isChanged ? "bg-green-500/10 hover:bg-green-500/20" : "hover:bg-[var(--vscode-list-hoverBackground)]"}>
                    <td className="w-10 text-right pr-3 select-none opacity-30 border-r border-[var(--vscode-panel-border)]">{i + 1}</td>
                    <td className="w-6 text-center select-none opacity-30 text-green-500">{isChanged ? "+" : " "}</td>
                    <td className={`pl-2 whitespace-pre ${isChanged ? "text-green-200/90" : "opacity-80"}`}>{prop || " "}</td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer / Summary */}
      <div className="px-4 py-1.5 bg-[var(--vscode-statusBar-background)] border-t border-[var(--vscode-panel-border)] flex justify-end gap-3">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          <span className="text-[9px] opacity-60">기존 코드</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          <span className="text-[9px] opacity-60">AI 중재안</span>
        </div>
      </div>
    </div>
  );
};
