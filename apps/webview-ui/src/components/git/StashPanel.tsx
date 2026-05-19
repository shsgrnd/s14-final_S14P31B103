import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Plus, Play, CornerDownRight, Trash2, ChevronDown, ChevronUp, X, Check } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { btn, bigBtn } from '../../shared/styles';
import { SectionNotificationBanner } from '../common/SectionNotificationBanner';
import { useSidebarSectionNotificationMode } from '../../app/SidebarSectionNotificationContext';
import { t } from '../../i18n';

export const StashPanel: React.FC = () => {
  const { stashes, currentBranch, sectionNotifications, clearSectionNotification } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();
  const dismissStashNotification = useCallback(() => clearSectionNotification('stash'), [clearSectionNotification]);
  const { showSectionBannersInline } = useSidebarSectionNotificationMode();

  const isGitConnected = currentBranch !== '';
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [stashMessage, setStashMessage] = useState('');
  const [expandedStash, setExpandedStash] = useState<string | null>(null);

  useEffect(() => {
    if (isGitConnected) {
      sendMessage('GET_STASH_LIST', {});
    }
  }, [isGitConnected, sendMessage]);

  const refresh = () => sendMessage('GET_STASH_LIST', {});

  const handleSave = () => {
    sendMessage('STASH_SAVE', { message: stashMessage.trim() || undefined });
    setStashMessage('');
    setShowSaveForm(false);
    window.setTimeout(refresh, 300);
  };

  const handleApply = (ref: string) => sendMessage('STASH_APPLY', { ref });

  const handlePop = (ref: string) => {
    sendMessage('STASH_POP', { ref });
    window.setTimeout(refresh, 300);
  };

  const handleDrop = (ref: string) => {
    sendMessage('STASH_DROP', { ref });
    window.setTimeout(refresh, 300);
  };

  return (
    <div className="animate-fade-in" style={{ padding: '8px 4px' }}>
      {showSectionBannersInline && (
        <SectionNotificationBanner
          notification={sectionNotifications.stash}
          onDismiss={dismissStashNotification}
        />
      )}

      {!showSaveForm ? (
        <div style={{ margin: '0 8px 8px 8px' }}>
          <button
            onClick={() => isGitConnected && setShowSaveForm(true)}
            disabled={!isGitConnected}
            title={t('stash.saveDescription')}
            style={{
              ...bigBtn('primary'),
              opacity: isGitConnected ? 1 : 0.5,
              cursor: isGitConnected ? 'pointer' : 'not-allowed',
            }}
          >
            <Archive size={13} /> {t('stash.save')}
          </button>
        </div>
      ) : (
        <div style={{ margin: '0 8px 8px 8px' }}>
          <div
            style={{
              fontSize: '12px',
              marginBottom: '6px',
              color: 'var(--vscode-descriptionForeground)',
            }}
          >
            {t('stash.inputLabel')}
          </div>
          <input
            autoFocus
            value={stashMessage}
            onChange={(e) => setStashMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') {
                setShowSaveForm(false);
                setStashMessage('');
              }
            }}
            placeholder={t('stash.inputPlaceholder')}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontSize: '12px',
              padding: '6px 8px',
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-focusBorder)',
              borderRadius: '3px',
              outline: 'none',
              marginBottom: '6px',
            }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleSave} style={btn('primary')}>
              <Check size={13} /> {t('stash.save')}
            </button>
            <button
              onClick={() => {
                setShowSaveForm(false);
                setStashMessage('');
              }}
              style={btn('secondary')}
            >
              <X size={13} /> {t('git.cancel')}
            </button>
          </div>
        </div>
      )}

      {!isGitConnected ? (
        <div
          style={{
            padding: '20px 12px',
            fontSize: '11px',
            color: 'var(--vscode-descriptionForeground)',
            textAlign: 'center',
            lineHeight: '1.6',
          }}
        >
          {t('stash.noRepository')}
        </div>
      ) : stashes.length === 0 ? (
        <div
          style={{
            padding: '16px 12px',
            fontSize: '12px',
            color: 'var(--vscode-descriptionForeground)',
            textAlign: 'center',
            opacity: 0.7,
          }}
        >
          {t('stash.empty')}
        </div>
      ) : (
        <div style={{ marginTop: '4px' }}>
          {stashes.map((stash) => {
            const isExpanded = expandedStash === stash.ref;
            return (
              <div key={stash.ref} style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
                <div
                  onClick={() => setExpandedStash((prev) => (prev === stash.ref ? null : stash.ref))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Archive size={13} style={{ color: 'var(--vscode-charts-blue)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {stash.message || `stash@{${stash.index}}`}
                    </div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: 'var(--vscode-descriptionForeground)',
                        marginTop: '2px',
                        display: 'flex',
                        gap: '6px',
                      }}
                    >
                      <span>{stash.branch}</span>
                      <span>·</span>
                      <span>{stash.date}</span>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '10px',
                      flexShrink: 0,
                      background: 'rgba(111,179,224,0.12)',
                      color: 'var(--vscode-charts-blue)',
                    }}
                  >
                    {stash.ref}
                  </span>
                  {isExpanded ? (
                    <ChevronUp size={12} style={{ flexShrink: 0, color: 'var(--vscode-descriptionForeground)' }} />
                  ) : (
                    <ChevronDown size={12} style={{ flexShrink: 0, color: 'var(--vscode-descriptionForeground)' }} />
                  )}
                </div>

                {isExpanded && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      padding: '0 12px 10px 12px',
                    }}
                  >
                    <button
                      onClick={() => handleApply(stash.ref)}
                      title={t('stash.applyTitle')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flex: 1,
                        fontSize: '11px',
                        fontWeight: 500,
                        padding: '5px 8px',
                        background: 'var(--vscode-button-secondaryBackground)',
                        color: 'var(--vscode-button-secondaryForeground)',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        justifyContent: 'center',
                      }}
                    >
                      <Play size={11} /> {t('stash.apply')}
                    </button>

                    <button
                      onClick={() => handlePop(stash.ref)}
                      title={t('stash.popTitle')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flex: 1,
                        fontSize: '11px',
                        fontWeight: 500,
                        padding: '5px 8px',
                        background: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        justifyContent: 'center',
                      }}
                    >
                      <CornerDownRight size={11} /> {t('stash.pop')}
                    </button>

                    <button
                      onClick={() => handleDrop(stash.ref)}
                      title={t('stash.dropTitle')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 500,
                        padding: '5px 8px',
                        background: 'transparent',
                        color: 'var(--vscode-errorForeground)',
                        border: '1px solid var(--vscode-errorForeground)',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        opacity: 0.8,
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
                      onMouseOut={(e) => (e.currentTarget.style.opacity = '0.8')}
                    >
                      <Trash2 size={11} /> {t('stash.drop')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isGitConnected && (
        <div style={{ margin: '8px 8px 4px 8px' }}>
          <button
            onClick={refresh}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              padding: '4px 8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--vscode-descriptionForeground)',
            }}
          >
            <Plus size={11} /> {t('stash.refresh')}
          </button>
        </div>
      )}
    </div>
  );
};
