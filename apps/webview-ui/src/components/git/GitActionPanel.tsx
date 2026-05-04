import React, { useState } from 'react';
import { GitBranch, Plus, ArrowUp, GitMerge, Check, Sparkles, ChevronDown, ChevronUp, X, CornerDownRight, Clock, RefreshCw } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { btn, bigBtn, inlineBtn } from '../../shared/styles';

export const GitActionPanel: React.FC = () => {
  const { currentBranch, branches, isRefreshingStatus, lastStatusRefreshAt } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showBranchAI, setShowBranchAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showCommitForm, setShowCommitForm] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [isBranchListOpen, setIsBranchListOpen] = useState(false);
  const [isRefreshPressed, setIsRefreshPressed] = useState(false);

  const showStatus = (text: string, ok: boolean) => {
    setStatusMsg({ text, ok });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const closeAIPrompt = () => {
    setShowBranchAI(false);
    setAiPrompt('');
  };

  const closeBranchForm = () => {
    setShowNewBranch(false);
    setNewBranchName('');
    closeAIPrompt();
  };

  const closeCommitForm = () => {
    setShowCommitForm(false);
    setCommitMessage('');
    closeAIPrompt();
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
      closeCommitForm();
    } else {
      closeBranchForm();
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

  const handleRefreshStatus = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsRefreshPressed(true);
    sendMessage('REFRESH_STATUS', { fetchRemote: true });
    window.setTimeout(() => setIsRefreshPressed(false), 700);
  };

  const handleCreateBranch = () => {
    if (!newBranchName.trim()) return;
    sendMessage('APPLY_BRANCH', { name: newBranchName });
    closeBranchForm();
  };

  const selectableBranches = branches.filter((branch) => branch.name !== currentBranch);

  const handleAISubmit = () => {
    const prompt = aiPrompt.trim();
    if (!prompt) return;

    if (showCommitForm) {
      sendMessage('RECOMMEND_COMMIT', { purpose: prompt });
    } else {
      sendMessage('RECOMMEND_BRANCH', { purpose: prompt });
    }

    closeAIPrompt();
  };

  const aiPromptPlaceholder = showCommitForm
    ? '어떤 기능을 구현하셨나요? commit에 넣을 내용을 정리해서 입력해주세요.'
    : '어떤 기능을 구현하실 예정인가요? branch에 넣을 내용을 정리해서 입력해주세요.';

  const refreshStatusLabel = isRefreshingStatus
    ? 'Refreshing Git status...'
    : lastStatusRefreshAt
      ? `Updated ${formatRefreshTime(lastStatusRefreshAt)}`
      : 'Not refreshed yet';
  const isRefreshActive = isRefreshingStatus || isRefreshPressed;

  return (
    <div className="animate-fade-in" style={{ padding: '8px 4px' }}>
      {/* ── Branch Selector Accordion Header ── */}
      <div 
        onClick={() => setIsBranchListOpen(!isBranchListOpen)}
        style={{
          margin: isBranchListOpen ? '0 8px 0 8px' : '0 8px 4px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 8px 7px 10px',
          borderRadius: isBranchListOpen ? '4px 4px 0 0' : '4px',
          border: '1px solid var(--vscode-panel-border)',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            aria-label="Refresh Git status"
            title="Refresh Git status"
            onClick={handleRefreshStatus}
            disabled={isRefreshingStatus}
            style={iconBtnStyle(isRefreshActive)}
          >
            <RefreshCw
              size={13}
              style={{
                color: isRefreshActive ? 'var(--vscode-button-foreground)' : 'var(--vscode-descriptionForeground)',
                animation: isRefreshActive ? 'gitcat-refresh-spin 0.7s ease-in-out' : 'none',
                transition: 'color 0.18s ease',
              }}
            />
          </button>
          {isBranchListOpen ? <ChevronUp size={14} style={{ color: 'var(--vscode-descriptionForeground)' }} /> : <ChevronDown size={14} style={{ color: 'var(--vscode-descriptionForeground)' }} />}
        </div>
      </div>
      <div style={{
        margin: '0 10px 8px 10px',
        minHeight: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '10px',
        color: 'var(--vscode-descriptionForeground)',
        opacity: 0.82,
      }}>
        <style>{`
          @keyframes gitcat-refresh-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          color: isRefreshActive ? 'var(--vscode-charts-blue)' : 'var(--vscode-descriptionForeground)',
          opacity: isRefreshActive ? 1 : 0.82,
        }}>
          {isRefreshActive && (
            <span style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: 'var(--vscode-charts-blue)',
              boxShadow: '0 0 0 2px rgba(111, 179, 224, 0.18)',
            }} />
          )}
          {refreshStatusLabel}
        </span>
        <span style={{ color: 'var(--vscode-descriptionForeground)', opacity: 0.82 }}>Auto every 20s</span>
      </div>

      {/* ── Branch List Accordion Content ── */}
      <div
        style={{
          margin: isBranchListOpen ? '0 8px 12px 8px' : '0 8px 0 8px',
          border: '1px solid var(--vscode-panel-border)',
          borderTop: 'none',
          borderRadius: '0 0 4px 4px',
          overflow: 'hidden',
          background: 'var(--vscode-editor-background)',
          maxHeight: isBranchListOpen ? '220px' : '0px',
          opacity: isBranchListOpen ? 1 : 0,
          transform: isBranchListOpen ? 'translateY(0)' : 'translateY(-6px)',
          transition: 'max-height 0.22s ease, opacity 0.18s ease, transform 0.22s ease, margin 0.22s ease',
        }}
      >
        {selectableBranches.length === 0 ? (
          <div style={{
            padding: '10px 12px',
            fontSize: '12px',
            color: 'var(--vscode-descriptionForeground)',
            opacity: 0.65,
            textAlign: 'left',
          }}>
            다른 branch가 존재하지 않습니다.
          </div>
        ) : selectableBranches.map(b => {
          const isActive = currentBranch === b.name;
          return (
            <div 
              key={b.name}
              onClick={() => { sendMessage('CHECKOUT_BRANCH', { name: b.name }); setIsBranchListOpen(false); }}
              style={{ 
                padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                cursor: 'pointer',
                borderBottom: b === selectableBranches[selectableBranches.length - 1] ? 'none' : '1px solid var(--vscode-panel-border)',
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

      {/* ── New Branch Row ── */}
      {!showCommitForm && !showNewBranch ? (
        <div style={{ margin: '8px 8px 4px 8px' }}>
          <button
            onClick={() => {
              closeCommitForm();
              setShowNewBranch(true);
            }}
            style={bigBtn('primary')}
          >
            <GitBranch size={13} />
            New branch
          </button>
        </div>
      ) : (
        !showCommitForm && (
          <div style={{ margin: '8px' }}>
          <div style={{
            fontSize: '12px', marginBottom: '6px',
            color: 'var(--vscode-descriptionForeground)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>Create New Branch</span>
            <button
              onClick={() => setShowBranchAI(true)}
              style={{ ...inlineBtn, color: 'var(--vscode-button-foreground)', background: 'var(--vscode-button-background)' }}
            >
              <Sparkles size={11} /> AI 추천
            </button>
          </div>
          <input
            autoFocus
            value={newBranchName}
            onChange={e => setNewBranchName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateBranch(); if (e.key === 'Escape') closeBranchForm(); }}
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
        )
      )}

      {/* Create / Cancel buttons when new branch input is open */}
      {!showCommitForm && showNewBranch && (
        <div style={{ margin: '4px 8px', display: 'flex', gap: '8px' }}>
          <button onClick={handleCreateBranch} style={btn('primary')}>
            <Check size={13} /> Create
          </button>
          <button onClick={closeBranchForm} style={btn('secondary')}>
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
              style={{ ...inlineBtn, color: 'var(--vscode-button-foreground)', background: 'var(--vscode-button-background)' }}
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
              width: '100%', boxSizing: 'border-box', resize: 'none', fontSize: '12px',
              padding: '8px', background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)',
              borderRadius: '3px', outline: 'none', fontFamily: 'inherit',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--vscode-focusBorder)')}
            onBlur={e => (e.target.style.borderColor = 'var(--vscode-panel-border)')}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button onClick={handleCommit} style={btn('primary')}>
              <Check size={13} /> Create
            </button>
            <button onClick={closeCommitForm} style={btn('secondary')}>
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Main Action Buttons (Grid) ── */}
      {!showNewBranch && !showCommitForm && (
        <div style={{ margin: '12px 8px 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button onClick={handleGitAdd} style={bigBtn('secondary')}>
            <Plus size={13} /> Git add
          </button>
          <button onClick={() => setShowCommitForm(true)} style={bigBtn('secondary')}>
            <Check size={13} /> Git Commit
          </button>
          <button onClick={handlePush} style={bigBtn('secondary')}>
            <ArrowUp size={13} /> Git Push
          </button>
          <button onClick={handleMerge} style={bigBtn('secondary')}>
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
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--vscode-charts-purple)', fontWeight: 600 }}>
              <Sparkles size={14} /> AI 텍스트 추천
            </div>
          </div>
          <textarea
            autoFocus
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAISubmit();
              }
              if (e.key === 'Escape') {
                closeAIPrompt();
              }
            }}
            placeholder={aiPromptPlaceholder}
            rows={4}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'none', fontSize: '12px',
              padding: '8px', background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-panel-border)',
              borderRadius: '3px', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button
              onClick={handleAISubmit}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                flex: 1,
                fontSize: '12px',
                fontWeight: 500,
                padding: '6px 12px',
                background: 'var(--vscode-charts-purple)',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              <CornerDownRight size={13} /> Enter
            </button>
            <button
              onClick={closeAIPrompt}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                flex: 1,
                fontSize: '12px',
                fontWeight: 500,
                padding: '6px 12px',
                background: 'var(--vscode-button-secondaryBackground)',
                color: 'var(--vscode-button-secondaryForeground)',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


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

const iconBtnStyle = (active: boolean): React.CSSProperties => ({
  width: '24px',
  height: '24px',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: active ? '1px solid var(--vscode-focusBorder)' : '1px solid transparent',
  borderRadius: '3px',
  background: active ? 'var(--vscode-button-background)' : 'transparent',
  cursor: active ? 'default' : 'pointer',
  opacity: 1,
  boxShadow: active ? '0 0 0 2px rgba(111, 179, 224, 0.16)' : 'none',
  transition: 'background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
});

function formatRefreshTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
