import React, { useCallback } from 'react';
import { FileText, Rewind, ChevronRight, BrainCircuit, ShieldCheck, User, Merge, Plus, Edit2, Trash2, History, Check, Bookmark } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { SnapshotMeta } from '@gitcat/shared-types';
import { iconBtn } from '../../shared/styles';
import { SectionNotificationBanner } from '../common/SectionNotificationBanner';

export const SnapshotTimeline: React.FC = () => {
  const { snapshots, expandedSnapshotId, setExpandedSnapshotId, sectionNotifications, clearSectionNotification } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();
  const dismissSnapshotsNotification = useCallback(() => clearSectionNotification('snapshots'), [clearSectionNotification]);
  const [statusMsg, setStatusMsg] = React.useState<{ text: string; ok: boolean } | null>(null);

  const showStatus = (text: string, ok: boolean) => {
    setStatusMsg({ text, ok });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const getStatusLabel = (status: string) => {
    if (status === 'MODIFIED') return '수정';
    if (status === 'ADDED') return '추가';
    if (status === 'DELETED') return '삭제';
    return status;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'ai_pre_action':
      case 'ai_result':
        return <BrainCircuit size={14} style={{ color: 'var(--vscode-charts-purple)', flexShrink: 0 }} />;
      case 'auto_dirty_before_ai':
        return <Merge size={14} style={{ color: 'var(--vscode-charts-blue)', flexShrink: 0 }} />;
      case 'manual_edit_result':
        return <User size={14} style={{ color: 'var(--vscode-charts-green)', flexShrink: 0 }} />;
      case 'savepoint':
        return <Bookmark size={14} style={{ color: 'var(--vscode-charts-yellow)', flexShrink: 0 }} />;
      case 'pre_restore':
        return <ShieldCheck size={14} style={{ color: 'var(--vscode-charts-red)', flexShrink: 0 }} />;
      default: return <FileText size={14} style={{ flexShrink: 0 }} />;
    }
  };

  const handleRename = (snapshotId: string, currentTitle: string) => {
    // VS Code Webview에서는 window.prompt가 차단되므로 프론트 자체 상태로 변경하거나 임의 텍스트로 대체합니다.
    const newTitle = currentTitle + ' (수정됨)';
    sendMessage('RENAME_SNAPSHOT', { snapshotId, newTitle });
    showStatus('이름이 임시로 변경되었습니다.', true);
  };

  const handleDelete = (snapshotId: string) => {
    // window.confirm 차단 우회
    sendMessage('DELETE_SNAPSHOT', { snapshotId });
    showStatus('스냅샷이 삭제되었습니다.', true);
  };

  const handleRestore = (snapshot: SnapshotMeta) => {
    // window.confirm 차단 우회
    sendMessage('RESTORE_SNAPSHOT', { snapshotId: snapshot.snapshotId });
    showStatus(`'${snapshot.summary || snapshot.type}' 시점으로 원복 완료! (안전 백업 생성됨)`, true);
  };

  return (
    <div className="animate-fade-in" style={{ padding: '4px 0' }}>
      <SectionNotificationBanner
        notification={sectionNotifications.snapshots}
        onDismiss={dismissSnapshotsNotification}
      />
      {/* ── Header row with count badge + create button ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 10px 8px 10px',
      }}>
        <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', fontWeight: 600 }}>
          {/* badge is rendered in App.tsx section header */}
        </span>
        <button
          onClick={() => sendMessage('CREATE_SNAPSHOT', { title: `수동 스냅샷 (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` })}
          title="스냅샷 생성"
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

      {/* ── Status Message ── */}
      {statusMsg && (
        <div style={{
          margin: '0 10px 8px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px',
          color: statusMsg.ok ? 'var(--vscode-charts-green)' : 'var(--vscode-errorForeground)',
        }}>
          <Check size={12} />
          {statusMsg.text}
        </div>
      )}

      {/* ── Snapshot list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {snapshots.length === 0 && (
          <div style={{ padding: '12px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic', textAlign: 'center' }}>
            생성된 스냅샷이 없습니다.
          </div>
        )}
        {snapshots.map((snapshot) => {
          const isExpanded = expandedSnapshotId === snapshot.snapshotId;
          const files = (snapshot as any).files;
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
                  <button onClick={() => handleRename(snapshot.snapshotId, title)} title="이름 변경" style={iconBtn}>
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => handleDelete(snapshot.snapshotId)} title="삭제" style={{ ...iconBtn, color: 'var(--vscode-errorForeground)' }}>
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
                        onClick={() => sendMessage('OPEN_FILE_DIFF', { snapshotId: snapshot.snapshotId, filePath: file.path })}
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
                          color: file.status === 'MODIFIED' ? 'var(--vscode-gitDecoration-modifiedResourceForeground)' :
                            file.status === 'ADDED' ? 'var(--vscode-gitDecoration-addedResourceForeground)' :
                              'var(--vscode-gitDecoration-deletedResourceForeground)',
                        }}>
                          {getStatusLabel(file.status)}
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
      {snapshots.length > 0 && (
        <div style={{ padding: '12px 10px 4px 10px' }}>
          <button style={{
            width: '100%', padding: '6px', fontSize: '12px',
            color: 'var(--vscode-descriptionForeground)',
            background: 'transparent', border: '1px solid transparent',
            borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            transition: 'all 0.2s'
          }}
            onMouseOver={e => { e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'; e.currentTarget.style.color = 'var(--vscode-foreground)' }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--vscode-descriptionForeground)' }}
          >
            <History size={14} />
            모든 기록 보기
          </button>
        </div>
      )}
    </div>
  );
};

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


