import React, { useState } from 'react';
import { GitBranch, Plus, ArrowUp, GitMerge, Check, Sparkles, ChevronDown, ChevronUp, X, CornerDownRight, Clock } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';

export const GitActionPanel: React.FC = () => {
  const { currentBranch, branches } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showBranchAI, setShowBranchAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showCommitForm, setShowCommitForm] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [isBranchListOpen, setIsBranchListOpen] = useState(false);

  const showStatus = (text: string, ok: boolean) => {
    setStatusMsg({ text, ok });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleGitAdd = () => {
    sendMessage('GIT_ADD_ALL');
    showStatus('Git add가 완료되었습니다.', true);
  };

  const handleCommit = () => {
    if (showCommitForm) {
      if (!commitMessage.trim()) return;
      sendMessage('EXECUTE_COMMIT', { message: commitMessage });
      showStatus('Git commit이 완료되었습니다.', true);
      setCommitMessage('');
      setShowCommitForm(false);
    } else {
      setShowCommitForm(true);
    }
  };

  const handlePush = () => {
    sendMessage('GIT_PUSH');
    showStatus('Git push가 완료되었습니다.', true);
  };

  const handleMerge = () => {
    sendMessage('OPEN_MERGE_PANEL');
    showStatus('Merge가 완료되었습니다.', true);
  };

  const handleCreateBranch = () => {
    if (!newBranchName.trim()) return;
    sendMessage('APPLY_BRANCH', { name: newBranchName });
    setNewBranchName('');
    setShowNewBranch(false);
  };

  return (
    <div className="animate-fade-in" style={{ padding: '8px 4px' }}>
      {/* ── Branch Selector Accordion Header ── */}
      <div 
        onClick={() => setIsBranchListOpen(!isBranchListOpen)}
        style={{
          margin: '0 8px 8px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--vscode-panel-border)',
          background: 'var(--vscode-input-background)', cursor: 'pointer', transition: 'all 0.2s'
        }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--vscode-panel-border)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <GitBranch size={15} style={{ color: 'var(--vscode-charts-blue)', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentBranch || 'main'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isBranchListOpen ? <ChevronUp size={14} style={{ color: 'var(--vscode-descriptionForeground)' }} /> : <ChevronDown size={14} style={{ color: 'var(--vscode-descriptionForeground)' }} />}
        </div>
      </div>

      {/* ── Branch List Accordion Content ── */}
      {isBranchListOpen && (
        <div style={{ 
          margin: '0 8px 12px 8px', border: '1px solid var(--vscode-panel-border)', borderRadius: '4px', 
          overflow: 'hidden', background: 'var(--vscode-editor-background)' 
        }}>
          {branches.map(b => {
            const isActive = currentBranch === b.name;
            return (
              <div 
                key={b.name}
                onClick={() => { sendMessage('CHECKOUT_BRANCH', { name: b.name }); setIsBranchListOpen(false); }}
                style={{ 
                  padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                  cursor: 'pointer', borderBottom: '1px solid var(--vscode-panel-border)', 
                  background: isActive ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent', 
                  color: isActive ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit' 
                }}
                onMouseOver={e => { if(!isActive) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)' }}
                onMouseOut={e => { if(!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <GitBranch size={12} style={{ color: 'var(--vscode-descriptionForeground)' }} />
                  <span style={{ fontSize: '12px' }}>{b.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>
                  <Clock size={10} /> {b.lastActivity}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── New Branch Row ── */}
      {!showNewBranch ? (
        <div style={{ margin: '4px 8px', display: 'flex', alignItems: 'center', padding: '4px' }}>
          <button
            onClick={() => setShowNewBranch(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '12px', color: 'var(--vscode-descriptionForeground)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
            onMouseOver={e => (e.currentTarget.style.color = 'var(--vscode-foreground)')}
            onMouseOut={e => (e.currentTarget.style.color = 'var(--vscode-descriptionForeground)')}
          >
            <Plus size={13} />
            Create new branch
          </button>
        </div>
      ) : (
        <div style={{ margin: '8px' }}>
          <div style={{
            fontSize: '12px', marginBottom: '6px',
            color: 'var(--vscode-descriptionForeground)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>Create New Branch</span>
            <button
              onClick={() => setShowBranchAI(true)}
              style={{ ...inlineBtnStyle, color: 'var(--vscode-button-foreground)', background: 'var(--vscode-button-background)' }}
            >
              <Sparkles size={11} /> AI 추천
            </button>
          </div>
          <input
            autoFocus
            value={newBranchName}
            onChange={e => setNewBranchName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateBranch(); if (e.key === 'Escape') setShowNewBranch(false); }}
            placeholder="생성할 브랜치명을 작성해주세요"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: '12px', padding: '6px 8px',
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-focusBorder)',
              borderRadius: '3px', outline: 'none',
            }}
          />
        </div>
      )}

      {/* Create / Cancel buttons when new branch input is open */}
      {showNewBranch && (
        <div style={{ margin: '4px 8px', display: 'flex', gap: '8px' }}>
          <button onClick={handleCreateBranch} style={btnStyle('primary')}>
            <Check size={13} /> Create
          </button>
          <button onClick={() => setShowNewBranch(false)} style={btnStyle('secondary')}>
            <X size={13} /> Cancel
          </button>
        </div>
      )}

      {/* ── Commit message form ── */}
      {showCommitForm && (
        <div style={{ margin: '8px' }}>
          <div style={{
            fontSize: '12px', marginBottom: '6px',
            color: 'var(--vscode-descriptionForeground)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>Create Commit message</span>
            <button
              onClick={() => setShowBranchAI(true)}
              style={{ ...inlineBtnStyle, color: 'var(--vscode-button-foreground)', background: 'var(--vscode-button-background)' }}
            >
              <Sparkles size={11} /> AI 추천
            </button>
          </div>
          <textarea
            autoFocus
            value={commitMessage}
            onChange={e => setCommitMessage(e.target.value)}
            placeholder="생성할 커밋명을 작성해주세요"
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: '12px',
              padding: '8px', background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)',
              borderRadius: '3px', outline: 'none', fontFamily: 'inherit',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--vscode-focusBorder)')}
            onBlur={e => (e.target.style.borderColor = 'var(--vscode-panel-border)')}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button onClick={handleCommit} style={btnStyle('primary')}>
              <Check size={13} /> Create
            </button>
            <button onClick={() => setShowCommitForm(false)} style={btnStyle('secondary')}>
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Main Action Buttons (Grid) ── */}
      {!showNewBranch && !showCommitForm && (
        <div style={{ margin: '12px 8px 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button onClick={handleGitAdd} style={bigBtnStyle('secondary')}>
            <Plus size={13} /> Git add
          </button>
          <button onClick={() => setShowCommitForm(true)} style={bigBtnStyle('secondary')}>
            <Check size={13} /> Git Commit
          </button>
          <button onClick={handlePush} style={bigBtnStyle('secondary')}>
            <ArrowUp size={13} /> Git Push
          </button>
          <button onClick={handleMerge} style={bigBtnStyle('secondary')}>
            <GitMerge size={13} /> Merge
          </button>
        </div>
      )}

      {/* Status feedback message */}
      {statusMsg && (
        <div style={{
          margin: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px',
          color: statusMsg.ok ? 'var(--vscode-charts-green)' : 'var(--vscode-errorForeground)',
        }}>
          <Check size={13} />
          {statusMsg.text}
        </div>
      )}

      {/* ── AI Prompt Webview Panel ── */}
      {showBranchAI && (
        <div style={{
          margin: '12px 8px 8px 8px', padding: '12px',
          background: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-charts-purple)',
          boxShadow: '0 0 10px rgba(197, 134, 192, 0.1)',
          borderRadius: '4px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--vscode-charts-purple)', fontWeight: 600 }}>
              <Sparkles size={14} /> AI 텍스트 추천
            </div>
            <button onClick={() => setShowBranchAI(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--vscode-descriptionForeground)' }}>
              <X size={14} />
            </button>
          </div>
          <textarea
            autoFocus
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            placeholder="어떤 기능을 구현하셨나요? 프롬프트를 입력해주세요."
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: '12px',
              padding: '8px', background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)',
              borderRadius: '3px', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button
              onClick={() => { sendMessage('RECOMMEND_BRANCH', { purpose: aiPrompt }); setShowBranchAI(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 14px', background: 'var(--vscode-charts-purple)', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
            >
              <CornerDownRight size={13} /> 엔터
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const btnStyle = (variant: 'primary' | 'secondary'): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  fontSize: '12px', fontWeight: 500, padding: '6px 12px', borderRadius: '3px',
  cursor: 'pointer', border: 'none', flex: 1,
  background: variant === 'primary' ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)',
  color: variant === 'primary' ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)',
});

const bigBtnStyle = (variant: 'primary' | 'secondary'): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  fontSize: '12px', fontWeight: 500, padding: '8px', borderRadius: '3px',
  cursor: 'pointer', border: 'none', width: '100%',
  background: variant === 'primary' ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)',
  color: variant === 'primary' ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)',
  transition: 'background 0.2s',
});

const inlineBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '4px',
  fontSize: '11px', fontWeight: 600, padding: '4px 8px',
  background: 'var(--vscode-button-secondaryBackground)',
  color: 'var(--vscode-button-secondaryForeground)',
  border: 'none', borderRadius: '3px', cursor: 'pointer',
};
