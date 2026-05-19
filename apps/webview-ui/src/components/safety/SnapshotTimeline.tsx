import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Rewind, ChevronRight, Plus, Edit2, Trash2, History, X, AlertTriangle } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { SnapshotMeta, type RestoreHistory } from '@gitcat/shared-types';
import { iconBtn } from '../../shared/styles';
import { SectionNotificationBanner } from '../common/SectionNotificationBanner';
import { useSidebarSectionNotificationMode } from '../../app/SidebarSectionNotificationContext';
import { snapshotsVisibleInSidebarTimeline } from '../../shared/snapshotTimelineVisibility';
import { t } from '../../i18n';

export const SnapshotTimeline: React.FC = () => {
  const {
    snapshots,
    expandedSnapshotId,
    setExpandedSnapshotId,
    sectionNotifications,
    clearSectionNotification,
    snapshotFileDiff,
    clearSnapshotFileDiff,
    restoreHistories,
    restoreConfirmDialog,
    clearRestoreConfirmDialog,
  } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();
  const dismissSnapshotsNotification = useCallback(() => clearSectionNotification('snapshots'), [clearSectionNotification]);
  const { showSectionBannersInline } = useSidebarSectionNotificationMode();
  const [restoreHistoryOpen, setRestoreHistoryOpen] = useState(false);
  const [deleteConfirmSnapshotId, setDeleteConfirmSnapshotId] = useState<string | null>(null);
  const [editingSnapshotId, setEditingSnapshotId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const visibleSnapshots = useMemo(() => snapshotsVisibleInSidebarTimeline(snapshots), [snapshots]);

  useEffect(() => {
    if (!expandedSnapshotId) return;
    sendMessage('GET_SNAPSHOT_DETAIL', { snapshotId: expandedSnapshotId });
  }, [expandedSnapshotId, sendMessage]);

  useEffect(() => {
    if (!expandedSnapshotId) return;
    const row = snapshots.find((snapshot) => snapshot.snapshotId === expandedSnapshotId);
    if (!row || row.type === 'pre_restore') {
      setExpandedSnapshotId(null);
    }
  }, [snapshots, expandedSnapshotId, setExpandedSnapshotId]);

  useEffect(() => {
    if (!snapshotFileDiff && !restoreHistoryOpen && !restoreConfirmDialog) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (restoreConfirmDialog) {
        clearRestoreConfirmDialog();
        sendMessage('CONFIRM_RESTORE_SNAPSHOT', {
          snapshotId: restoreConfirmDialog.snapshotId,
          confirmed: false,
        });
        return;
      }
      if (snapshotFileDiff) clearSnapshotFileDiff();
      else setRestoreHistoryOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [snapshotFileDiff, restoreHistoryOpen, restoreConfirmDialog, clearSnapshotFileDiff, clearRestoreConfirmDialog, sendMessage]);

  useEffect(() => {
    if (!deleteConfirmSnapshotId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setDeleteConfirmSnapshotId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteConfirmSnapshotId]);

  const deleteConfirmSnapshot = useMemo(
    () => visibleSnapshots.find((s) => s.snapshotId === deleteConfirmSnapshotId) ?? null,
    [visibleSnapshots, deleteConfirmSnapshotId],
  );

  const getStatusLabel = (status: string) => {
    const normalized = status.toUpperCase();
    if (normalized === 'MODIFIED') return t('snapshot.status.modified');
    if (normalized === 'ADDED') return t('snapshot.status.added');
    if (normalized === 'DELETED') return t('snapshot.status.deleted');
    if (normalized === 'RENAMED') return t('snapshot.status.renamed');
    return status;
  };

  const handleRename = (snapshotId: string, currentTitle: string) => {
    setEditingSnapshotId(snapshotId);
    setEditingTitle(currentTitle);
  };

  const commitRename = (snapshotId: string, originalTitle: string) => {
    const nextTitle = editingTitle.trim();
    setEditingSnapshotId(null);
    if (!nextTitle || nextTitle === originalTitle) return;
    sendMessage('RENAME_SNAPSHOT', {
      snapshotId,
      newTitle: nextTitle,
    });
  };

  const cancelRename = () => {
    setEditingSnapshotId(null);
    setEditingTitle('');
  };

  const requestDeleteSnapshot = (snapshotId: string) => {
    setDeleteConfirmSnapshotId(snapshotId);
  };

  const handleConfirmDeleteSnapshot = () => {
    if (!deleteConfirmSnapshotId) return;
    sendMessage('DELETE_SNAPSHOT', { snapshotId: deleteConfirmSnapshotId });
    if (expandedSnapshotId === deleteConfirmSnapshotId) {
      setExpandedSnapshotId(null);
    }
    setDeleteConfirmSnapshotId(null);
  };

  const handleCancelDeleteSnapshot = () => {
    setDeleteConfirmSnapshotId(null);
  };

  const handleRestore = (snapshot: SnapshotMeta) => {
    sendMessage('RESTORE_SNAPSHOT', { snapshotId: snapshot.snapshotId });
  };


  const handleCancelRestore = () => {
    if (!restoreConfirmDialog) return;
    sendMessage('CONFIRM_RESTORE_SNAPSHOT', {
      snapshotId: restoreConfirmDialog.snapshotId,
      confirmed: false,
    });
    clearRestoreConfirmDialog();
  };

  const handleConfirmRestore = () => {
    if (!restoreConfirmDialog) return;
    sendMessage('CONFIRM_RESTORE_SNAPSHOT', {
      snapshotId: restoreConfirmDialog.snapshotId,
      confirmed: true,
    });
    clearRestoreConfirmDialog();
  };

  return (
    <div className="animate-fade-in" style={{ padding: '4px 0' }}>
      {showSectionBannersInline && (
        <SectionNotificationBanner
          notification={sectionNotifications.snapshots}
          onDismiss={dismissSnapshotsNotification}
        />
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 10px 8px 10px',
        }}
      >
        <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', fontWeight: 600 }} />
        <button
          type="button"
          onClick={() =>
            sendMessage('CREATE_SNAPSHOT', {
              title: t('snapshots.createAuto', {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              }),
            })
          }
          title={t('snapshots.createManualTitle')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: 'var(--vscode-foreground)',
            borderRadius: '3px',
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)')}
          onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
        >
          <Plus size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {visibleSnapshots.length === 0 && (
          <div style={{ padding: '12px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic', textAlign: 'center' }}>
            {t('snapshots.empty')}
          </div>
        )}

        {visibleSnapshots.map((snapshot) => {
          const isExpanded = expandedSnapshotId === snapshot.snapshotId;
          const files = snapshot.files ?? [];
          const addedLines = files.reduce((acc, file) => acc + (file.added || 0), 0);
          const removedLines = files.reduce((acc, file) => acc + (file.removed || 0), 0);
          const title = snapshot.summary || snapshot.type;
          const isEditing = editingSnapshotId === snapshot.snapshotId;

          return (
            <div key={snapshot.snapshotId}>
              <div
                onClick={() => setExpandedSnapshotId(isExpanded ? null : snapshot.snapshotId)}
                title={String(title)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '8px 10px',
                  cursor: 'pointer',
                  background: isExpanded ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                  color: isExpanded ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit',
                  transition: 'background 0.2s',
                }}
                onMouseOver={(e) => {
                  if (!isExpanded) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
                }}
                onMouseOut={(e) => {
                  if (!isExpanded) e.currentTarget.style.background = 'transparent';
                }}
              >
                <ChevronRight
                  size={15}
                  style={{
                    marginTop: '2px',
                    flexShrink: 0,
                    color: 'var(--vscode-descriptionForeground)',
                    transition: 'transform 0.2s ease',
                    transform: isExpanded ? 'rotate(90deg)' : 'none',
                  }}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.currentTarget.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => commitRename(snapshot.snapshotId, title)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename(snapshot.snapshotId, title);
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      style={{
                        width: '100%',
                        fontSize: '13px',
                        fontWeight: 500,
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-focusBorder)',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontStyle: snapshot.type === 'pre_restore' ? 'italic' : 'normal',
                        opacity: snapshot.type === 'pre_restore' ? 0.85 : 1,
                      }}
                    >
                      {title}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)', overflow: 'hidden' }}>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {t('snapshots.files', { count: files.length })}
                    </span>
                    {addedLines > 0 && <span style={{ color: 'var(--vscode-gitDecoration-addedResourceForeground)' }}>+{addedLines}</span>}
                    {removedLines > 0 && <span style={{ color: 'var(--vscode-gitDecoration-deletedResourceForeground)' }}>-{removedLines}</span>}
                    <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {snapshot.createdAt ? formatRelativeTime(Date.parse(snapshot.createdAt)) : ''}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0, marginTop: '2px' }} onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => handleRename(snapshot.snapshotId, title)} title={t('snapshots.renameTitle')} style={iconBtn}>
                    <Edit2 size={12} />
                  </button>
                  <button type="button" onClick={() => requestDeleteSnapshot(snapshot.snapshotId)} title={t('snapshots.deleteTitle')} style={{ ...iconBtn, color: 'var(--vscode-errorForeground)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

  { isExpanded && (
    <div
      style={{
        marginLeft: '26px',
        paddingLeft: '12px',
        paddingRight: '10px',
        borderLeft: '1px solid var(--vscode-panel-border)',
        marginBottom: '8px',
        paddingBottom: '4px',
        paddingTop: '4px',
      }}
    >
      {files.length > 0 ? (
        files.map((file, index) => (
          <div
            key={`${file.path}-${index}`}
            title={t('snapshots.fileDiffTitle', { path: file.path })}
            onClick={() =>
              sendMessage('GET_SNAPSHOT_FILE_DIFF', {
                snapshotId: snapshot.snapshotId,
                filePath: file.path,
              })
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <FileText size={12} style={{ opacity: 0.7, flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.path.split('/').pop()}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                flexShrink: 0,
                color: diffStatusColor(String(file.status)),
              }}
            >
              {getStatusLabel(String(file.status))}
            </span>
          </div>
        ))
      ) : (
        <div style={{ padding: '6px 8px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic' }}>
          {t('snapshots.changedFilesEmpty')}
        </div>
      )}

      <button
        type="button"
        title={t('snapshots.restoreTitle')}
        onClick={() => sendMessage('RESTORE_SNAPSHOT', { snapshotId: snapshot.snapshotId })}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          width: '100%',
          marginTop: '10px',
          padding: '6px',
          background: 'var(--vscode-button-background)',
          color: 'var(--vscode-button-foreground)',
          border: 'none',
          borderRadius: '3px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 600,
        }}
      >
        <Rewind size={13} />
        {t('snapshots.restore')}
      </button>
    </div>
  )}
            </div >
          );
        })}
      </div >

{
  visibleSnapshots.length > 0 && (
    <div style={{ padding: '12px 10px 4px 10px' }}>
      <button
        style={{
          width: '100%',
          padding: '6px',
          fontSize: '12px',
          color: 'var(--vscode-descriptionForeground)',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
        type="button"
        title={t('snapshots.viewAllTitle')}
        onClick={() => {
          sendMessage('GET_RESTORE_HISTORY', {});
          setRestoreHistoryOpen(true);
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
          e.currentTarget.style.color = 'var(--vscode-foreground)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--vscode-descriptionForeground)';
        }}
      >
        <History size={14} />
        {t('snapshots.viewAll')}
      </button>
    </div>
  )
}

      <DiffDialog snapshotFileDiff={snapshotFileDiff} onClose={clearSnapshotFileDiff} />
      <RestoreHistoryDialog histories={restoreHistories} open={restoreHistoryOpen} onClose={() => setRestoreHistoryOpen(false)} />
      <RestoreConfirmDialog
        dialog={restoreConfirmDialog}
        onCancel={handleCancelRestore}
        onConfirm={handleConfirmRestore}
      />
      <DeleteConfirmDialog
        open={!!deleteConfirmSnapshotId}
        snapshot={deleteConfirmSnapshot}
        onCancel={handleCancelDeleteSnapshot}
        onConfirm={handleConfirmDeleteSnapshot}
      />
    </div >
  );
};

/**
 * 스냅샷 삭제 여부를 한 번 더 확인하는 모달 다이얼로그 컴포넌트입니다.
 * 사용자가 실수로 스냅샷을 삭제하여 로컬 백업이 유실되는 것을 방지하기 위해 생성되었습니다.
 * 다국어(i18n) 시스템인 t() 함수를 통해 다국어 메시지를 동적으로 렌더링합니다.
 */
function DeleteConfirmDialog({
  open,
  snapshot,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  snapshot: SnapshotMeta | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // 모달이 열려있지 않거나 대상 스냅샷이 없으면 렌더링하지 않습니다.
  if (!open || !snapshot) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('snapshots.deleteConfirm.title')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60000,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--vscode-editor-background)',
          color: 'var(--vscode-editor-foreground)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: '8px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4)',
          padding: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: 'var(--vscode-errorForeground)' }}>
          <AlertTriangle size={18} />
          <span style={{ fontSize: '14px', fontWeight: 700 }}>{t('snapshots.deleteConfirm.title')}</span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', lineHeight: 1.5, margin: '0 0 8px 0' }}>
          {t('snapshots.deleteConfirm.body')}
        </p>
        <p style={{
          fontSize: '12px',
          margin: 0,
          padding: '8px 10px',
          borderRadius: '6px',
          border: '1px solid var(--vscode-panel-border)',
          background: 'var(--vscode-editorWidget-background)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {snapshot.summary || snapshot.type}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              border: '1px solid var(--vscode-panel-border)',
              background: 'transparent',
              color: 'var(--vscode-foreground)',
              borderRadius: '4px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            {t('snapshots.deleteConfirm.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              border: 'none',
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
              borderRadius: '4px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {t('snapshots.deleteConfirm.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DiffDialog({
  snapshotFileDiff,
  onClose,
}: {
  snapshotFileDiff: { filePath: string; diffText: string } | null;
  onClose: () => void;
}) {
  if (!snapshotFileDiff) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('snapshots.diffDialog')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50000,
        background: 'rgba(0, 0, 0, 0.45)',
        overflowY: 'auto',
        padding: '24px 16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          margin: '0 auto',
          width: '100%',
          maxWidth: '720px',
          height: 'min(90vh, calc(100vh - 48px))',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--vscode-editor-background)',
          color: 'var(--vscode-editor-foreground)',
          borderRadius: '6px',
          border: '1px solid var(--vscode-panel-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader title={t('snapshots.diffDialogHeader', { path: snapshotFileDiff.filePath })} onClose={onClose} />
        <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}>
          <pre
            style={{
              margin: 0,
              padding: '8px 10px',
              fontSize: '11px',
              lineHeight: 1.45,
              fontFamily: 'var(--vscode-editor-font-family, monospace)',
            }}
          >
            {renderColoredDiffText(snapshotFileDiff.diffText)}
          </pre>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RestoreHistoryDialog({
  histories,
  open,
  onClose,
}: {
  histories: RestoreHistory[];
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('snapshots.restoreHistory')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50000,
        background: 'rgba(0, 0, 0, 0.45)',
        overflowY: 'auto',
        padding: '24px 16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          margin: '0 auto',
          width: '100%',
          maxWidth: '520px',
          height: 'min(90vh, calc(100vh - 48px))',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--vscode-editor-background)',
          color: 'var(--vscode-editor-foreground)',
          borderRadius: '6px',
          border: '1px solid var(--vscode-panel-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader title={t('snapshots.restoreHistory')} onClose={onClose} />
        <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '8px' }}>
          {histories.length === 0 ? (
            <div style={{ padding: '16px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)', textAlign: 'center' }}>
              {t('snapshots.restoreHistoryEmpty')}
            </div>
          ) : (
            histories.map((row) => {
              const view = row as unknown as RestoreHistoryRowView;
              const from = view.fromSnapshotId ?? view.preRestoreSnapshotId ?? '--';
              const to = view.toSnapshotId ?? view.targetSnapshotId ?? '--';
              return (
                <div
                  key={view.restoreId}
                  style={{
                    padding: '10px 8px',
                    borderBottom: '1px solid var(--vscode-panel-border)',
                    fontSize: '11px',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                    {t('snapshots.restoreHistoryEntry', {
                      time: new Date(view.restoredAt).toLocaleString(),
                      status: view.status,
                    })}
                  </div>
                  <div style={{ color: 'var(--vscode-descriptionForeground)', fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
                    {t('snapshots.restoreHistoryFlow', {
                      from: from !== '--' ? `${from.slice(0, 8)}...` : '--',
                      to: to !== '--' ? `${to.slice(0, 8)}...` : '--',
                    })}
                  </div>
                  {view.failureReason && (
                    <div style={{ color: 'var(--vscode-errorForeground)', marginTop: '4px' }}>{view.failureReason}</div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RestoreConfirmDialog({
  dialog,
  onCancel,
  onConfirm,
}: {
  dialog: { snapshotId: string; changedPathsCount: number; warningMessages: string[] } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!dialog) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('snapshots.restoreConfirm.title')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60000,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'var(--vscode-editor-background)',
          color: 'var(--vscode-editor-foreground)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: '8px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4)',
          padding: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>
          {t('snapshots.restoreConfirm.title')}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', lineHeight: 1.5 }}>
          {t('snapshots.restoreConfirm.body', { count: dialog.changedPathsCount })}
        </div>
        <div
          style={{
            marginTop: '10px',
            maxHeight: '180px',
            overflowY: 'auto',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: '6px',
            padding: '8px',
            background: 'var(--vscode-editorWidget-background)',
            fontSize: '12px',
            lineHeight: 1.5,
          }}
        >
          {dialog.warningMessages.map((warning, index) => (
            <div key={`${index}-${warning}`} style={{ marginBottom: index === dialog.warningMessages.length - 1 ? 0 : '6px' }}>
              - {warning}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              border: '1px solid var(--vscode-panel-border)',
              background: 'transparent',
              color: 'var(--vscode-foreground)',
              borderRadius: '4px',
              padding: '6px 12px',
              cursor: 'pointer',
            }}
          >
            {t('snapshots.restoreConfirm.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              border: 'none',
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
              borderRadius: '4px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {t('snapshots.restoreConfirm.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        flexShrink: 0,
        padding: '10px 12px',
        borderBottom: '1px solid var(--vscode-panel-border)',
        fontSize: '12px',
        fontWeight: 600,
        background: 'var(--vscode-editor-background)',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{title}</span>
      <button
        type="button"
        title={`${t('snapshots.close')} (Esc)`}
        aria-label={t('snapshots.close')}
        onClick={onClose}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          border: '1px solid var(--vscode-contrastBorder, var(--vscode-panel-border))',
          background: 'var(--vscode-editorWidget-background, var(--vscode-toolbar-hoverBackground))',
          color: 'var(--vscode-editor-foreground)',
          borderRadius: '4px',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <X size={18} strokeWidth={2.4} />
      </button>
    </div>
  );
}

type RestoreHistoryRowView = {
  restoreId: string;
  restoredAt: string;
  status: string;
  preRestoreSnapshotId?: string;
  fromSnapshotId?: string;
  toSnapshotId?: string;
  targetSnapshotId?: string;
  failureReason?: string;
};

type DiffLineKind = 'add' | 'del' | 'meta' | 'ctx';

function classifyDiffLine(raw: string): DiffLineKind {
  const line = raw.trimEnd();
  if (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('@@') ||
    line.startsWith('New file mode') ||
    line.startsWith('Deleted file mode') ||
    line.startsWith('similarity index') ||
    line.startsWith('rename from') ||
    line.startsWith('rename to') ||
    line.startsWith('Binary files') ||
    line.startsWith('\\')
  ) {
    return 'meta';
  }
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return 'ctx';
}

function diffStatusColor(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === 'MODIFIED') return 'var(--vscode-gitDecoration-modifiedResourceForeground)';
  if (normalized === 'ADDED') return 'var(--vscode-gitDecoration-addedResourceForeground)';
  if (normalized === 'RENAMED') return 'var(--vscode-gitDecoration-modifiedResourceForeground)';
  return 'var(--vscode-gitDecoration-deletedResourceForeground)';
}

function renderColoredDiffText(diffText: string): React.ReactNode {
  const lines = diffText.split('\n');
  return lines.map((line, index) => {
    const kind = classifyDiffLine(line);
    const style: React.CSSProperties =
      kind === 'add'
        ? {
          color: 'var(--vscode-gitDecoration-addedResourceForeground)',
          background: 'var(--vscode-diffEditor-insertedTextBackground)',
        }
        : kind === 'del'
          ? {
            color: 'var(--vscode-gitDecoration-deletedResourceForeground)',
            background: 'var(--vscode-diffEditor-removedTextBackground)',
          }
          : kind === 'meta'
            ? {
              color: 'var(--vscode-descriptionForeground)',
              opacity: 0.8,
            }
            : {};
    return (
      <div key={`${index}-${line}`} style={style}>
        {line || ' '}
      </div>
    );
  });
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return t('relative.justNow');

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return t('relative.minutesAgo', { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('relative.hoursAgo', { count: hours });

  const days = Math.floor(hours / 24);
  return t('relative.daysAgo', { count: days });
}
