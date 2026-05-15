import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Rewind, ChevronRight, Crosshair, Sparkles, Layers, PencilLine, Plus, Edit2, Trash2, History, Bookmark, Archive, X } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { SnapshotMeta, type RestoreHistory } from '@gitcat/shared-types';
import { iconBtn } from '../../shared/styles';
import { SectionNotificationBanner } from '../common/SectionNotificationBanner';
import { useSidebarSectionNotificationMode } from '../../app/SidebarSectionNotificationContext';
import { snapshotsVisibleInSidebarTimeline } from '../../shared/snapshotTimelineVisibility';

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

  const visibleSnapshots = useMemo(() => snapshotsVisibleInSidebarTimeline(snapshots), [snapshots]);

  useEffect(() => {
    if (!expandedSnapshotId) return;
    sendMessage('GET_SNAPSHOT_DETAIL', { snapshotId: expandedSnapshotId });
  }, [expandedSnapshotId, sendMessage]);

  /** 목록에서 숨긴 pre_restore 등으로 펼침 대상이 사라지면 접기 */
  useEffect(() => {
    if (!expandedSnapshotId) return;
    const row = snapshots.find((s) => s.snapshotId === expandedSnapshotId);
    if (!row || row.type === 'pre_restore') {
      setExpandedSnapshotId(null);
    }
  }, [snapshots, expandedSnapshotId, setExpandedSnapshotId]);

  useEffect(() => {
    if (!snapshotFileDiff && !restoreHistoryOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (snapshotFileDiff) clearSnapshotFileDiff();
      else setRestoreHistoryOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [snapshotFileDiff, restoreHistoryOpen, clearSnapshotFileDiff]);

  useEffect(() => {
    if (!restoreConfirmDialog) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      clearRestoreConfirmDialog();
      sendMessage('CONFIRM_RESTORE_SNAPSHOT', {
        snapshotId: restoreConfirmDialog.snapshotId,
        confirmed: false,
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [restoreConfirmDialog, clearRestoreConfirmDialog, sendMessage]);

  const getStatusLabel = (status: string) => {
    const u = status.toUpperCase();
    if (u === 'MODIFIED') return '수정';
    if (u === 'ADDED') return '추가';
    if (u === 'DELETED') return '삭제';
    if (u === 'RENAMED') return '이름 변경';
    return status;
  };

  const getTypeIcon = (type: string) => {
    const iconColor = (color: string): React.CSSProperties => ({
      color,
      flexShrink: 0,
    });
    switch (type) {
      case 'ai_pre_action':
        return <Crosshair size={14} style={iconColor('var(--vscode-charts-purple)')} aria-hidden />;
      case 'ai_result':
        return <Sparkles size={14} style={iconColor('var(--vscode-charts-purple)')} aria-hidden />;
      case 'auto_dirty_before_ai':
        return <Layers size={14} style={iconColor('var(--vscode-charts-blue)')} aria-hidden />;
      case 'manual_edit_result':
        return <PencilLine size={14} style={iconColor('var(--vscode-charts-green)')} aria-hidden />;
      case 'savepoint':
        return <Bookmark size={14} style={iconColor('var(--vscode-charts-yellow)')} aria-hidden />;
      case 'pre_restore':
        return <Archive size={14} style={iconColor('var(--vscode-charts-orange)')} aria-hidden />;
      default:
        return <FileText size={14} style={{ flexShrink: 0, opacity: 0.85 }} aria-hidden />;
    }
  };

  const handleRename = (snapshotId: string, currentTitle: string) => {
    const newTitle = currentTitle + ' (수정됨)';
    sendMessage('RENAME_SNAPSHOT', { snapshotId, newTitle });
  };

  const handleDelete = (snapshotId: string) => {
    sendMessage('DELETE_SNAPSHOT', { snapshotId });
  };

  const handleRestore = (snapshot: SnapshotMeta) => {
    sendMessage('RESTORE_SNAPSHOT', { snapshotId: snapshot.snapshotId });
  };

  const handleConfirmRestore = () => {
    if (!restoreConfirmDialog) return;
    sendMessage('CONFIRM_RESTORE_SNAPSHOT', {
      snapshotId: restoreConfirmDialog.snapshotId,
      confirmed: true,
    });
    clearRestoreConfirmDialog();
  };

  const handleCancelRestore = () => {
    if (!restoreConfirmDialog) return;
    sendMessage('CONFIRM_RESTORE_SNAPSHOT', {
      snapshotId: restoreConfirmDialog.snapshotId,
      confirmed: false,
    });
    clearRestoreConfirmDialog();
  };

  const openRestoreHistory = () => {
    sendMessage('GET_RESTORE_HISTORY', {});
    setRestoreHistoryOpen(true);
  };

  return (
    <div className="animate-fade-in" style={{ padding: '4px 0' }}>
      {showSectionBannersInline && (
        <SectionNotificationBanner
          notification={sectionNotifications.snapshots}
          onDismiss={dismissSnapshotsNotification}
        />
      )}
      {/* ── Header row with count badge + create button ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 10px 8px 10px',
      }}>
        <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', fontWeight: 600 }}>
          {/* badge is rendered in App.tsx section header */}
        </span>
        <button
          type="button"
          onClick={() => sendMessage('CREATE_SNAPSHOT', { title: `수동 스냅샷 (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` })}
          title="수동 스냅샷 생성 요청 (익스텐션에서 지원할 때 동작)"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
            color: 'var(--vscode-foreground)', borderRadius: '3px',
            display: 'flex', alignItems: 'center',
          }}
          onMouseOver={e => (e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)')}
          onMouseOut={e => (e.currentTarget.style.background = 'none')}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* ── Snapshot list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {visibleSnapshots.length === 0 && (
          <div style={{ padding: '12px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic', textAlign: 'center' }}>
            생성된 스냅샷이 없습니다.
          </div>
        )}
        {visibleSnapshots.map((snapshot) => {
          const isExpanded = expandedSnapshotId === snapshot.snapshotId;
          const files = snapshot.files;
          const addedLines = files?.reduce((acc: number, f: any) => acc + (f.added || 0), 0) ?? 0;
          const removedLines = files?.reduce((acc: number, f: any) => acc + (f.removed || 0), 0) ?? 0;
          const fileCount = files?.length ?? 0;
          const title = snapshot.summary || snapshot.type;

          return (
            <div key={snapshot.snapshotId}>
              {/* Row */}
              <div
                onClick={() => setExpandedSnapshotId(isExpanded ? null : snapshot.snapshotId)}
                className="snapshot-row"
                title={String(title)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px',
                  padding: '8px 10px', cursor: 'pointer',
                  background: isExpanded ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                  color: isExpanded ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit',
                  transition: 'background 0.2s',
                }}
                onMouseOver={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'; }}
                onMouseOut={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Expand arrow */}
                <ChevronRight
                  size={15}
                  style={{
                    marginTop: '2px', flexShrink: 0,
                    color: 'var(--vscode-descriptionForeground)',
                    transition: 'transform 0.2s ease',
                    transform: isExpanded ? 'rotate(90deg)' : 'none',
                  }}
                />

                {/* Type icon */}
                <div style={{ marginTop: '3px' }}>
                  {getTypeIcon(snapshot.type)}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px', fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontStyle: snapshot.type === 'pre_restore' ? 'italic' : 'normal',
                    opacity: snapshot.type === 'pre_restore' ? 0.85 : 1,
                  }}>
                    {title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)', overflow: 'hidden' }}>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>📄 {fileCount} files</span>
                    {addedLines > 0 && <span style={{ color: 'var(--vscode-gitDecoration-addedResourceForeground)', whiteSpace: 'nowrap', flexShrink: 0 }}>+{addedLines}</span>}
                    {removedLines > 0 && <span style={{ color: 'var(--vscode-gitDecoration-deletedResourceForeground)', whiteSpace: 'nowrap', flexShrink: 0 }}>-{removedLines}</span>}
                    <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {snapshot.createdAt ? formatRelativeTime(Date.parse(snapshot.createdAt)) : ''}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0, marginTop: '2px' }}
                  onClick={e => e.stopPropagation()}>
                  <button type="button" onClick={() => handleRename(snapshot.snapshotId, title)} title="스냅샷 표시 이름 변경 요청 (익스텐션 연동 시)" style={iconBtn}>
                    <Edit2 size={12} />
                  </button>
                  <button type="button" onClick={() => handleDelete(snapshot.snapshotId)} title="이 스냅샷과 로컬 백업을 삭제합니다" style={{ ...iconBtn, color: 'var(--vscode-errorForeground)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* ── Expanded File List & Restore Button ── */}
              {isExpanded && (
                <div style={{
                  marginLeft: '26px', paddingLeft: '12px', paddingRight: '10px',
                  borderLeft: '1px solid var(--vscode-panel-border)',
                  marginBottom: '8px', paddingBottom: '4px', paddingTop: '4px',
                }}>
                  {files && files.length > 0 ? (
                    files.map((file: any, idx: number) => (
                      <div
                        key={idx}
                        title={`스냅샷 diff 보기: ${file.path}`}
                        onClick={() =>
                          sendMessage('GET_SNAPSHOT_FILE_DIFF', {
                            snapshotId: snapshot.snapshotId,
                            filePath: file.path,
                          })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
                          transition: 'background 0.15s',
                        }}
                        onMouseOver={e => (e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)')}
                        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <FileText size={12} style={{ opacity: 0.7, flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.path.split('/').pop()}
                        </span>
                        <span style={{
                          fontSize: '11px', fontWeight: 700, flexShrink: 0,
                          color: (() => {
                            const st = String(file.status).toUpperCase();
                            if (st === 'MODIFIED') return 'var(--vscode-gitDecoration-modifiedResourceForeground)';
                            if (st === 'ADDED') return 'var(--vscode-gitDecoration-addedResourceForeground)';
                            if (st === 'RENAMED') return 'var(--vscode-gitDecoration-modifiedResourceForeground)';
                            return 'var(--vscode-gitDecoration-deletedResourceForeground)';
                          })(),
                        }}>
                          {getStatusLabel(String(file.status))}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '6px 8px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic' }}>
                      변경된 파일이 없습니다.
                    </div>
                  )}

                  {/* Restore Button */}
                  <button
                    type="button"
                    title="이 스냅샷이 기록한 시점으로 워크스페이스 파일을 되돌립니다. 복원 직전 상태는 자동 백업 스냅샷으로 남을 수 있습니다."
                    onClick={() => handleRestore(snapshot)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      width: '100%', marginTop: '10px', padding: '6px',
                      background: 'var(--vscode-button-background)',
                      color: 'var(--vscode-button-foreground)',
                      border: 'none', borderRadius: '3px', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 600, transition: 'opacity 0.2s',
                    }}
                    onMouseOver={e => e.currentTarget.style.opacity = '0.9'}
                    onMouseOut={e => e.currentTarget.style.opacity = '1'}
                  >
                    <Rewind size={13} />
                    이 시점으로 원복
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── View All History Button ── */}
      {visibleSnapshots.length > 0 && (
        <div style={{ padding: '12px 10px 4px 10px' }}>
          <button style={{
            width: '100%', padding: '6px', fontSize: '12px',
            color: 'var(--vscode-descriptionForeground)',
            background: 'transparent', border: '1px solid transparent',
            borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            transition: 'all 0.2s'
          }}
            type="button"
            title="스냅샷 복원 이력을 불러와 목록으로 표시합니다"
            onClick={openRestoreHistory}
            onMouseOver={e => { e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'; e.currentTarget.style.color = 'var(--vscode-foreground)' }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--vscode-descriptionForeground)' }}
          >
            <History size={14} />
            모든 기록 보기
          </button>
        </div>
      )}

      {snapshotFileDiff
        ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="스냅샷 파일 diff"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50_000,
            background: 'rgba(0, 0, 0, 0.45)',
            overflowY: 'auto',
            padding: '24px 16px',
          }}
          onClick={clearSnapshotFileDiff}
        >
          <div
            style={{
              margin: '0 auto',
              width: '100%',
              maxWidth: '720px',
              height: 'min(90vh, calc(100vh - 48px))',
              minHeight: 0,
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
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                Diff — {snapshotFileDiff.filePath}
              </span>
              <button
                type="button"
                title="닫기 (Esc)"
                aria-label="닫기"
                onClick={clearSnapshotFileDiff}
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
            <div
              style={{
                flex: '1 1 auto',
                minHeight: 0,
                overflow: 'auto',
                overscrollBehavior: 'contain',
              }}
            >
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
        )
        : null}

      {restoreHistoryOpen
        ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="복원 기록"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50_000,
            background: 'rgba(0, 0, 0, 0.45)',
            overflowY: 'auto',
            padding: '24px 16px',
          }}
          onClick={() => setRestoreHistoryOpen(false)}
        >
          <div
            style={{
              margin: '0 auto',
              width: '100%',
              maxWidth: '520px',
              height: 'min(90vh, calc(100vh - 48px))',
              minHeight: 0,
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
              <span>복원 기록</span>
              <button
                type="button"
                title="닫기 (Esc)"
                aria-label="닫기"
                onClick={() => setRestoreHistoryOpen(false)}
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
            <div
              style={{
                flex: '1 1 auto',
                minHeight: 0,
                overflow: 'auto',
                overscrollBehavior: 'contain',
                padding: '8px',
              }}
            >
              {restoreHistories.length === 0 ? (
                <div style={{ padding: '16px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)', textAlign: 'center' }}>
                  복원 기록이 없습니다.
                </div>
              ) : (
                restoreHistories.map((h) => {
                  const v = asRestoreHistoryView(h);
                  const from = v.fromSnapshotId ?? v.preRestoreSnapshotId ?? '—';
                  const to = v.toSnapshotId ?? v.targetSnapshotId ?? '—';
                  return (
                  <div
                    key={v.restoreId}
                    style={{
                      padding: '10px 8px',
                      borderBottom: '1px solid var(--vscode-panel-border)',
                      fontSize: '11px',
                      lineHeight: 1.5,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                      {new Date(v.restoredAt).toLocaleString()} — {v.status}
                    </div>
                    <div style={{ color: 'var(--vscode-descriptionForeground)', fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
                      {from !== '—' ? `${from.slice(0, 8)}… → ` : ''}{to !== '—' ? `${to.slice(0, 8)}…` : to}
                    </div>
                    {v.failureReason && (
                      <div style={{ color: 'var(--vscode-errorForeground)', marginTop: '4px' }}>{v.failureReason}</div>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body,
        )
        : null}

      {restoreConfirmDialog
        ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="스냅샷 복원 확인"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60_000,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={handleCancelRestore}
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
              대량 삭제 위험 경고
            </div>
            <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', lineHeight: 1.5 }}>
              복원 시 {restoreConfirmDialog.changedPathsCount}개 경로가 변경됩니다. 아래 경고를 확인한 뒤 진행해 주세요.
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
              {restoreConfirmDialog.warningMessages.map((warning, idx) => (
                <div key={`${idx}-${warning}`} style={{ marginBottom: idx === restoreConfirmDialog.warningMessages.length - 1 ? 0 : '6px' }}>
                  - {warning}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
              <button
                type="button"
                onClick={handleCancelRestore}
                style={{
                  border: '1px solid var(--vscode-panel-border)',
                  background: 'transparent',
                  color: 'var(--vscode-foreground)',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
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
                확인하고 복원
              </button>
            </div>
          </div>
        </div>,
        document.body,
        )
        : null}
    </div>
  );
};

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

function asRestoreHistoryView(h: RestoreHistory): RestoreHistoryRowView {
  return h as unknown as RestoreHistoryRowView;
}

type DiffLineKind = 'add' | 'del' | 'meta' | 'ctx';
type DiffDisplayLine = {
  kind: Exclude<DiffLineKind, 'meta'>;
  text: string;
  oldLine: number | null;
  newLine: number | null;
};

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

function diffLineColors(kind: DiffLineKind): { color: string; backgroundColor?: string } {
  switch (kind) {
    case 'add':
      return {
        color: 'var(--vscode-gitDecoration-addedResourceForeground)',
        backgroundColor: 'var(--vscode-diffEditor-insertedTextBackground)',
      };
    case 'del':
      return {
        color: 'var(--vscode-gitDecoration-deletedResourceForeground)',
        backgroundColor: 'var(--vscode-diffEditor-removedTextBackground)',
      };
    case 'meta':
      return { color: 'var(--vscode-descriptionForeground)' };
    default:
      return { color: 'var(--vscode-editor-foreground)' };
  }
}

function parseHunkHeader(line: string): { oldStart: number; newStart: number } | null {
  const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line.trim());
  if (!m) return null;
  return {
    oldStart: Number(m[1]),
    newStart: Number(m[2]),
  };
}

function buildDiffDisplayLines(text: string): DiffDisplayLine[] {
  const lines = text.split('\n');
  const result: DiffDisplayLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const rawLine of lines) {
    const kind = classifyDiffLine(rawLine);
    if (kind === 'meta') {
      const parsed = parseHunkHeader(rawLine);
      if (parsed) {
        oldLine = parsed.oldStart;
        newLine = parsed.newStart;
        inHunk = true;
      }
      continue;
    }
    if (!inHunk) {
      continue;
    }

    if (rawLine.startsWith('+')) {
      result.push({
        kind: 'add',
        text: rawLine,
        oldLine: null,
        newLine,
      });
      newLine += 1;
      continue;
    }

    if (rawLine.startsWith('-')) {
      result.push({
        kind: 'del',
        text: rawLine,
        oldLine,
        newLine: null,
      });
      oldLine += 1;
      continue;
    }

    result.push({
      kind: 'ctx',
      text: rawLine,
      oldLine,
      newLine,
    });
    oldLine += 1;
    newLine += 1;
  }

  return result;
}

function renderColoredDiffText(text: string | undefined): React.ReactNode {
  if (text == null || text.trim() === '') {
    return <span style={{ color: 'var(--vscode-descriptionForeground)' }}>(diff 없음)</span>;
  }
  const displayLines = buildDiffDisplayLines(text);
  const changedIndexes = displayLines
    .map((line, index) => (line.kind === 'add' || line.kind === 'del' ? index : -1))
    .filter((index) => index >= 0);

  if (changedIndexes.length === 0) {
    return <span style={{ color: 'var(--vscode-descriptionForeground)' }}>(변경된 +/- 라인이 없습니다)</span>;
  }

  const CONTEXT_LINES = 2;
  const include = new Set<number>();
  for (const idx of changedIndexes) {
    const start = Math.max(0, idx - CONTEXT_LINES);
    const end = Math.min(displayLines.length - 1, idx + CONTEXT_LINES);
    for (let i = start; i <= end; i += 1) {
      include.add(i);
    }
  }

  const selected = Array.from(include).sort((a, b) => a - b);
  const rendered: React.ReactNode[] = [];
  let prev = -1;
  for (const idx of selected) {
    if (prev >= 0 && idx - prev > 1) {
      rendered.push(
        <span
          key={`gap-${idx}`}
          style={{
            display: 'block',
            color: 'var(--vscode-descriptionForeground)',
            opacity: 0.7,
            padding: '0 6px',
          }}
        >
          ...
        </span>,
      );
    }

    const line = displayLines[idx];
    const kind = line.kind;
    const { color, backgroundColor } = diffLineColors(kind);
    rendered.push(
      <span
        key={idx}
        style={{
          display: 'grid',
          gridTemplateColumns: '30px 1fr',
          columnGap: '6px',
          alignItems: 'baseline',
          color,
          backgroundColor,
          whiteSpace: 'pre',
          minHeight: '1.45em',
          padding: '0 2px',
        }}
      >
        <span style={{ color: 'var(--vscode-descriptionForeground)', textAlign: 'right', userSelect: 'none' }}>
          {line.newLine ?? ''}
        </span>
        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {line.text.length === 0 ? '\u00a0' : line.text}
        </span>
      </span>
    );
    prev = idx;
  }

  return rendered;
}

function formatRelativeTime(timestamp: number): string {
  try {
    const diff = Date.now() - timestamp;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `방금 전`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    const day = Math.floor(hr / 24);
    return `${day}일 전`;
  } catch {
    return '';
  }
}

