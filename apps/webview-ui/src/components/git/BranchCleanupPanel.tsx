import React, { useState } from 'react';
import { Trash2, Clock, Sparkles, GitBranch, AlertTriangle } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';

type BranchStatus = 'active' | 'merged' | 'stale' | 'protected';

const STATUS_LABEL: Record<BranchStatus, string> = {
  active: '현재 활성',
  merged: '병합됨',
  stale: '오래됨',
  protected: '보호됨',
};

const STATUS_COLOR: Record<BranchStatus, string> = {
  active: '#4ec9b0',
  merged: '#6fb3e0',
  stale: '#ce9178',
  protected: '#c586c0',
};

const STATUS_BG: Record<BranchStatus, string> = {
  active: 'rgba(78,201,176,0.12)',
  merged: 'rgba(111,179,224,0.12)',
  stale: 'rgba(206,145,120,0.12)',
  protected: 'rgba(197,134,192,0.12)',
};

export const BranchCleanupPanel: React.FC = () => {
  const { branches } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [autoCleanup, setAutoCleanup] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  const showWarning = (msg: string) => {
    setWarningMsg(msg);
    setTimeout(() => setWarningMsg(null), 3500);
  };

  const deletableBranches = branches.filter(b => b.status !== 'active' && b.status !== 'protected');
  const allSelected = deletableBranches.length > 0 && selected.size === deletableBranches.length;

  const toggleAll = () => {
    if (deletableBranches.length === 0) {
      showWarning('삭제 가능한 브랜치가 없습니다.');
      return;
    }
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(deletableBranches.map((b) => b.name)));
    }
  };

  const toggleOne = (name: string, status: string) => {
    if (status === 'active') {
      showWarning(`'${name}' 브랜치는 현재 활성화되어 있어 삭제할 수 없습니다.`);
      return;
    }
    if (status === 'protected') {
      showWarning(`'${name}' 브랜치는 보호되고 있어 삭제할 수 없습니다.`);
      return;
    }

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleDelete = () => {
    if (selected.size === 0) return;
    const selectedBranches = branches.filter((branch) => selected.has(branch.name));
    const force = selectedBranches.some((branch) => branch.status === 'stale');
    sendMessage('DELETE_BRANCHES', { names: Array.from(selected), force });
    setSelected(new Set());
  };

  const mergedCount = branches.filter(b => b.status === 'merged').length;
  const staleCount = branches.filter(b => b.status === 'stale').length;
  const showAI = mergedCount > 0 || staleCount > 0;

  let aiMessage = '';
  if (mergedCount > 0 && staleCount > 0) {
    aiMessage = `${mergedCount}개의 병합된 브랜치와 ${staleCount}개의 오래된 브랜치`;
  } else if (mergedCount > 0) {
    aiMessage = `${mergedCount}개의 병합된 브랜치`;
  } else if (staleCount > 0) {
    aiMessage = `${staleCount}개의 오래된 브랜치`;
  }

  return (
    <div className="animate-fade-in" style={{ padding: '8px 4px' }}>
      {/* ── Select All Row ── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '6px 12px', cursor: deletableBranches.length > 0 ? 'pointer' : 'not-allowed',
          opacity: deletableBranches.length > 0 ? 1 : 0.6
        }}
        onClick={toggleAll}
      >
        <input
          type="checkbox"
          checked={allSelected}
          readOnly
          style={{ cursor: 'pointer', width: '14px', height: '14px', flexShrink: 0, pointerEvents: 'none' }}
        />
        <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', fontWeight: 500 }}>
          삭제 가능 전체 선택 ({selected.size}/{deletableBranches.length})
        </span>
      </div>

      {/* ── Branch List ── */}
      <div style={{ marginTop: '4px' }}>
        {branches.map((branch, idx) => {
          const status = (branch.status || 'active') as BranchStatus;
          const isChecked = selected.has(branch.name);
          const isUnclickable = status === 'active' || status === 'protected';

          return (
            <div
              key={idx}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 12px', cursor: isUnclickable ? 'not-allowed' : 'pointer',
                background: isChecked ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                color: isChecked ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit',
                opacity: isUnclickable ? 0.6 : 1,
              }}
              onMouseOver={e => { if (!isChecked && !isUnclickable) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'; }}
              onMouseOut={e => { if (!isChecked && !isUnclickable) e.currentTarget.style.background = 'transparent'; }}
              onClick={() => toggleOne(branch.name, status)}
            >
              <input
                type="checkbox"
                checked={isChecked}
                readOnly
                disabled={isUnclickable}
                style={{ cursor: isUnclickable ? 'not-allowed' : 'pointer', width: '14px', height: '14px', flexShrink: 0, pointerEvents: 'none' }}
              />
              <GitBranch size={14} style={{ color: 'var(--vscode-descriptionForeground)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {branch.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)', marginTop: '2px' }}>
                  <Clock size={10} />
                  {branch.lastActivity}
                </div>
              </div>
              <span style={{
                fontSize: '10px', fontWeight: 600, padding: '3px 8px',
                borderRadius: '12px', flexShrink: 0,
                color: STATUS_COLOR[status],
                background: STATUS_BG[status],
              }}>
                {STATUS_LABEL[status]}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── AI Recommendation Banner ── */}
      {showAI && (
        <div style={{
          margin: '12px 8px 8px 8px', padding: '12px',
          borderRadius: '4px', borderLeft: '3px solid #f9c513',
          background: 'rgba(249,197,19,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <Sparkles size={14} style={{ color: '#f9c513' }} />
            <span style={{ fontSize: '12px', fontWeight: 700 }}>AI 추천 가이드</span>
          </div>
          <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.5, color: 'var(--vscode-foreground)', opacity: 0.85 }}>
            <strong style={{ color: '#f9c513' }}>{aiMessage}</strong>를 안전하게 삭제할 수 있습니다.
          </p>
        </div>
      )}

      {/* ── Warning Message (Active/Protected) ── */}
      {warningMsg && (
        <div style={{
          margin: '12px 8px 0 8px', padding: '8px', fontSize: '11px',
          display: 'flex', alignItems: 'center', gap: '6px',
          color: 'var(--vscode-errorForeground)', background: 'var(--vscode-inputValidation-errorBackground)',
          border: '1px solid var(--vscode-inputValidation-errorBorder)', borderRadius: '3px',
        }}>
          <AlertTriangle size={13} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, lineHeight: 1.3 }}>{warningMsg}</span>
        </div>
      )}

      {/* ── Delete Action Button ── */}
      {selected.size > 0 && (
        <div style={{ margin: '12px 8px 8px 8px' }}>
          <button
            onClick={handleDelete}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              width: '100%', padding: '8px',
              background: 'var(--vscode-errorForeground)',
              color: '#fff', border: 'none', borderRadius: '3px',
              cursor: 'pointer', fontSize: '12px', fontWeight: 600,
              transition: 'opacity 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.opacity = '0.8'}
            onMouseOut={e => e.currentTarget.style.opacity = '1'}
          >
            <Trash2 size={13} />
            선택된 {selected.size}개 브랜치 삭제
          </button>
        </div>
      )}

      {/* ── Auto-Cleanup Toggle ── */}
      <div style={{ 
        margin: '12px 8px 0 8px', padding: '12px 4px 4px 4px', 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        borderTop: '1px solid var(--vscode-panel-border)' 
      }}>
        <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>자동 정리 활성화</span>
        
        {/* Custom Toggle Switch */}
        <div 
          onClick={() => setAutoCleanup(!autoCleanup)}
          style={{
            width: '32px', height: '16px', borderRadius: '8px',
            background: autoCleanup ? 'var(--vscode-button-background)' : 'var(--vscode-input-background)',
            position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
            border: '1px solid var(--vscode-panel-border)'
          }}
        >
          <div style={{
            width: '12px', height: '12px', borderRadius: '50%',
            background: autoCleanup ? 'var(--vscode-button-foreground)' : 'var(--vscode-descriptionForeground)',
            position: 'absolute', top: '1px', 
            left: autoCleanup ? 'calc(100% - 13px)' : '1px',
            transition: 'all 0.2s ease'
          }} />
        </div>
      </div>
    </div>
  );
};
