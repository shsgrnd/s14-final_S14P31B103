import React, { useEffect, useState, useCallback } from 'react';
import { Archive, Plus, Play, CornerDownRight, Trash2, ChevronDown, ChevronUp, X, Check } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { btn, bigBtn } from '../../shared/styles';
import { SectionNotificationBanner } from '../common/SectionNotificationBanner';

/**
 * Git Stash 관리 패널
 *
 * 역할:
 * - 현재 stash 목록 표시 (GET_STASH_LIST)
 * - Stash Save: 메모 입력 후 현재 변경사항 stash 저장 (STASH_SAVE)
 * - Stash Apply: stash를 현재 작업 트리에 적용 후 유지 (STASH_APPLY)
 * - Stash Pop: stash를 현재 작업 트리에 적용 후 삭제 (STASH_POP)
 * - Stash Drop: stash 항목 삭제 (STASH_DROP)
 */
export const StashPanel: React.FC = () => {
  const { stashes, currentBranch, sectionNotifications, clearSectionNotification } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();
  const dismissStashNotification = useCallback(() => clearSectionNotification('stash'), [clearSectionNotification]);

  const isGitConnected = currentBranch !== '';

  const [showSaveForm, setShowSaveForm] = useState(false);
  const [stashMessage, setStashMessage] = useState('');
  const [expandedStash, setExpandedStash] = useState<string | null>(null);

  // 마운트 시 stash 목록 요청
  useEffect(() => {
    if (isGitConnected) {
      sendMessage('GET_STASH_LIST', {});
    }
  }, [isGitConnected]);

  const handleSave = () => {
    sendMessage('STASH_SAVE', { message: stashMessage.trim() || undefined });
    setStashMessage('');
    setShowSaveForm(false);
    // 저장 후 목록 새로고침
    setTimeout(() => sendMessage('GET_STASH_LIST', {}), 300);
  };

  const handleApply = (ref: string) => {
    sendMessage('STASH_APPLY', { ref });
  };

  const handlePop = (ref: string) => {
    sendMessage('STASH_POP', { ref });
    setTimeout(() => sendMessage('GET_STASH_LIST', {}), 300);
  };

  const handleDrop = (ref: string) => {
    sendMessage('STASH_DROP', { ref });
    setTimeout(() => sendMessage('GET_STASH_LIST', {}), 300);
  };

  const toggleExpand = (ref: string) => {
    setExpandedStash(prev => (prev === ref ? null : ref));
  };

  return (
    <div className="animate-fade-in" style={{ padding: '8px 4px' }}>
      <SectionNotificationBanner
        notification={sectionNotifications.stash}
        onDismiss={dismissStashNotification}
      />

      {/* ── Stash Save 버튼 / 폼 ── */}
      {!showSaveForm ? (
        <div style={{ margin: '0 8px 8px 8px' }}>
          <button
            onClick={() => isGitConnected && setShowSaveForm(true)}
            disabled={!isGitConnected}
            style={{ 
              ...bigBtn('primary'), 
              opacity: isGitConnected ? 1 : 0.5,
              cursor: isGitConnected ? 'pointer' : 'not-allowed'
            }}
          >
            <Archive size={13} /> Stash 저장
          </button>
        </div>
      ) : (
        <div style={{ margin: '0 8px 8px 8px' }}>
          <div style={{
            fontSize: '12px', marginBottom: '6px',
            color: 'var(--vscode-descriptionForeground)',
          }}>
            변경사항을 stash로 저장합니다
          </div>
          <input
            autoFocus
            value={stashMessage}
            onChange={e => setStashMessage(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') { setShowSaveForm(false); setStashMessage(''); }
            }}
            placeholder="메모 입력 (선택사항)"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: '12px', padding: '6px 8px',
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-focusBorder)',
              borderRadius: '3px', outline: 'none',
              marginBottom: '6px',
            }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleSave} style={btn('primary')}>
              <Check size={13} /> 저장
            </button>
            <button onClick={() => { setShowSaveForm(false); setStashMessage(''); }} style={btn('secondary')}>
              <X size={13} /> 취소
            </button>
          </div>
        </div>
      )}

      {/* ── Stash 목록 ── */}
      {!isGitConnected ? (
        <div style={{
          padding: '20px 12px',
          fontSize: '11px',
          color: 'var(--vscode-descriptionForeground)',
          textAlign: 'center',
          lineHeight: '1.6'
        }}>
          저장소가 연결되지 않아<br/>Stash 정보를 불러올 수 없습니다.
        </div>
      ) : stashes.length === 0 ? (
        <div style={{
          padding: '16px 12px',
          fontSize: '12px',
          color: 'var(--vscode-descriptionForeground)',
          textAlign: 'center',
          opacity: 0.7,
        }}>
          저장된 stash가 없습니다.
        </div>
      ) : (
        <div style={{ marginTop: '4px' }}>
          {stashes.map((stash) => {
            const isExpanded = expandedStash === stash.ref;
            return (
              <div key={stash.ref} style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
                {/* ── Stash 항목 헤더 ── */}
                <div
                  onClick={() => toggleExpand(stash.ref)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px', cursor: 'pointer',
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <Archive size={13} style={{ color: 'var(--vscode-charts-blue)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12px', fontWeight: 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {stash.message || `stash@{${stash.index}}`}
                    </div>
                    <div style={{
                      fontSize: '10px', color: 'var(--vscode-descriptionForeground)', marginTop: '2px',
                      display: 'flex', gap: '6px',
                    }}>
                      <span>{stash.branch}</span>
                      <span>·</span>
                      <span>{stash.date}</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '10px', fontWeight: 600, padding: '2px 6px',
                    borderRadius: '10px', flexShrink: 0,
                    background: 'rgba(111,179,224,0.12)',
                    color: 'var(--vscode-charts-blue)',
                  }}>
                    {stash.ref}
                  </span>
                  {isExpanded
                    ? <ChevronUp size={12} style={{ flexShrink: 0, color: 'var(--vscode-descriptionForeground)' }} />
                    : <ChevronDown size={12} style={{ flexShrink: 0, color: 'var(--vscode-descriptionForeground)' }} />
                  }
                </div>

                {/* ── 펼쳐졌을 때 액션 버튼 ── */}
                {isExpanded && (
                  <div style={{
                    display: 'flex', gap: '6px',
                    padding: '0 12px 10px 12px',
                  }}>
                    {/* Apply: 적용 후 stash 유지 */}
                    <button
                      onClick={() => handleApply(stash.ref)}
                      title="stash를 적용하고 목록에서는 유지합니다"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        flex: 1, fontSize: '11px', fontWeight: 500, padding: '5px 8px',
                        background: 'var(--vscode-button-secondaryBackground)',
                        color: 'var(--vscode-button-secondaryForeground)',
                        border: 'none', borderRadius: '3px', cursor: 'pointer',
                        justifyContent: 'center',
                      }}
                    >
                      <Play size={11} /> Apply
                    </button>

                    {/* Pop: 적용 후 stash 삭제 */}
                    <button
                      onClick={() => handlePop(stash.ref)}
                      title="stash를 적용하고 목록에서 삭제합니다"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        flex: 1, fontSize: '11px', fontWeight: 500, padding: '5px 8px',
                        background: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none', borderRadius: '3px', cursor: 'pointer',
                        justifyContent: 'center',
                      }}
                    >
                      <CornerDownRight size={11} /> Pop
                    </button>

                    {/* Drop: stash만 삭제 */}
                    <button
                      onClick={() => handleDrop(stash.ref)}
                      title="stash를 목록에서 삭제합니다 (적용하지 않음)"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        fontSize: '11px', fontWeight: 500, padding: '5px 8px',
                        background: 'transparent',
                        color: 'var(--vscode-errorForeground)',
                        border: '1px solid var(--vscode-errorForeground)',
                        borderRadius: '3px', cursor: 'pointer',
                        opacity: 0.8,
                      }}
                      onMouseOver={e => (e.currentTarget.style.opacity = '1')}
                      onMouseOut={e => (e.currentTarget.style.opacity = '0.8')}
                    >
                      <Trash2 size={11} /> Drop
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 새로고침 버튼 ── */}
      {isGitConnected && (
        <div style={{ margin: '8px 8px 4px 8px' }}>
          <button
            onClick={() => sendMessage('GET_STASH_LIST', {})}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', padding: '4px 8px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--vscode-descriptionForeground)',
            }}
          >
            <Plus size={11} /> 목록 새로고침
          </button>
        </div>
      )}
    </div>
  );
};
