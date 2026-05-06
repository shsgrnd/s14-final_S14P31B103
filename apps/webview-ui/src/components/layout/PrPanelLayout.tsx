import React, { useState, useEffect } from 'react';
import { Sparkles, Check, X, RefreshCw, GitPullRequest } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';

export const PrPanelLayout: React.FC = () => {
  const { prSuggestion, isPrLoading, clearPrSuggestion, branches, currentBranch } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();

  const [prTitle, setPrTitle] = useState('');
  const [prDescription, setPrDescription] = useState('');
  const [baseBranch, setBaseBranch] = useState('');

  // AI 추천 결과 수신 시 폼 자동 입력
  useEffect(() => {
    if (prSuggestion) {
      setPrDescription(prev => prev ? `${prev}\n\n${prSuggestion}` : prSuggestion);
      if (!prTitle) {
        setPrTitle('AI 추천 PR 제목');
      }
      clearPrSuggestion();
    }
  }, [prSuggestion, prTitle, clearPrSuggestion]);

  const handleSubmit = () => {
    if (!prTitle.trim() || !prDescription.trim() || !baseBranch) return;
    sendMessage('CREATE_PR', { title: prTitle, description: prDescription, base: baseBranch });
  };

  return (
    <div style={{
      height: '100vh', width: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)',
      padding: '20px', boxSizing: 'border-box', overflowY: 'auto'
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <GitPullRequest size={24} style={{ color: 'var(--vscode-charts-blue)' }} />
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Create Pull Request</h1>
        
        <div style={{ flex: 1 }} />
        
        <button
          onClick={() => sendMessage('RECOMMEND_PR', { base: baseBranch })}
          disabled={isPrLoading || !baseBranch}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
            border: 'none', padding: '6px 12px', borderRadius: '4px',
            cursor: (isPrLoading || !baseBranch) ? 'not-allowed' : 'pointer', opacity: (isPrLoading || !baseBranch) ? 0.7 : 1,
            fontWeight: 500, fontSize: '12px'
          }}
        >
          {isPrLoading ? <RefreshCw size={14} style={{ animation: 'gitcat-refresh-spin 1s linear infinite' }} /> : <Sparkles size={14} />}
          AI 설명 추천
        </button>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vscode-foreground)' }}>Target Branch (Base)</label>
          <select
            value={baseBranch}
            onChange={e => setBaseBranch(e.target.value)}
            style={{
              padding: '8px 12px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
              border: `1px solid ${baseBranch ? 'var(--vscode-input-border, var(--vscode-panel-border))' : 'var(--vscode-focusBorder)'}`, 
              borderRadius: '4px', outline: 'none', fontSize: '13px', cursor: 'pointer'
            }}
          >
            <option value="" disabled>타겟 브랜치를 선택하세요</option>
            {branches
              .filter(b => b.name !== currentBranch)
              .map(b => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vscode-foreground)' }}>Title</label>
          <input
            autoFocus
            value={prTitle}
            onChange={e => setPrTitle(e.target.value)}
            placeholder="PR 제목을 입력하세요"
            style={{
              padding: '8px 12px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))', borderRadius: '4px',
              outline: 'none', fontSize: '13px'
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vscode-foreground)' }}>Description (Markdown)</label>
          <textarea
            value={prDescription}
            onChange={e => setPrDescription(e.target.value)}
            placeholder="이 PR에서 변경된 내용, 해결된 이슈 등을 상세히 적어주세요."
            style={{
              padding: '12px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))', borderRadius: '4px',
              outline: 'none', fontSize: '13px', minHeight: '300px', resize: 'vertical', fontFamily: 'var(--vscode-editor-font-family, monospace)',
              lineHeight: '1.5'
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
          <button
            onClick={handleSubmit}
            disabled={!prTitle.trim() || !prDescription.trim() || !baseBranch}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)',
              border: 'none', padding: '8px 16px', borderRadius: '4px',
              cursor: (!prTitle.trim() || !prDescription.trim() || !baseBranch) ? 'not-allowed' : 'pointer',
              opacity: (!prTitle.trim() || !prDescription.trim() || !baseBranch) ? 0.5 : 1,
              fontWeight: 500, fontSize: '13px'
            }}
          >
            <Check size={16} /> Create Pull Request
          </button>
        </div>
      </div>
    </div>
  );
};
