import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BarChart2, ChevronRight, ChevronDown,
  X, RefreshCw, ExternalLink,
} from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import type { WorkspaceFileTreeNode } from '@gitcat/shared-types';

// ── VS Code 스타일 인라인 SVG 아이콘 ─────────────────────────────────────────

const VscFolder: React.FC<{ open?: boolean }> = ({ open }) =>
  open ? (
    <svg width="14" height="14" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path d="M1.5 14h13l.5-.5V5l-.5-.5H7.71l-.86-.85L6.5 3.5h-5l-.5.5v10l.5.5z" fill="#dcb67a" />
      <path d="M15 5H7.71l-.86-.85L6.5 3.5H1v1h5.29l.86.85.35.15H15V5z" fill="#c09040" opacity="0.5" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <path d="M14.5 3H7.71l-.85-.85L6.5 1.99h-5l-.5.51V14l.5.5h13l.5-.5V3.5L14.5 3zm-.51 10.5h-12V3.49h4.81l.85.85.35.15H14v9.51z" fill="#dcb67a" />
    </svg>
  );

const VscFile: React.FC<{ color?: string }> = ({ color }) => (
  <svg width="13" height="13" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
    <path d="M13.71 4.29l-3-3L10 1H4L3 2v12l1 1h9l1-1V5l-.29-.71zM13 14H4V2h5v4h4v8zm-3-9V2.5l3.5 3.5H10z" fill={color ?? 'var(--vscode-descriptionForeground)'} />
  </svg>
);

// ── 파일 상태별 색상 및 레이블 설정 ──────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; label: string; short: string }> = {
  staged: { color: 'var(--vscode-gitDecoration-addedResourceForeground)', label: 'Staged', short: 'S' },
  unstaged: { color: 'var(--vscode-gitDecoration-modifiedResourceForeground)', label: 'Unstaged', short: 'M' },
  untracked: { color: 'var(--vscode-gitDecoration-untrackedResourceForeground)', label: 'Untracked', short: 'U' },
  conflicted: { color: 'var(--vscode-gitDecoration-conflictingResourceForeground)', label: 'Conflicted', short: '!' },
  pushable: { color: 'var(--vscode-charts-blue)', label: 'Pushable', short: 'P' },
};

type NodeStatus = 'untracked' | 'unstaged' | 'staged' | 'conflicted';

// ── 상태 요약 팝업 ────────────────────────────────────────────────────────────

interface StatusSummaryPopupProps {
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const StatusSummaryPopup: React.FC<StatusSummaryPopupProps> = ({ onClose, triggerRef }) => {
  const { statusSummary } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();
  const popupRef = useRef<HTMLDivElement>(null);

  // 팝업 외부 클릭 시 닫기 — 트리거 버튼 클릭은 버튼의 onClick이 처리하므로 제외
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insidePopup = popupRef.current?.contains(target);
      const insideTrigger = triggerRef.current?.contains(target);
      if (!insidePopup && !insideTrigger) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose, triggerRef]);

  // 마운트 시 상태 요약 요청
  useEffect(() => {
    sendMessage('GET_GIT_STATUS_SUMMARY', {});
  }, [sendMessage]);

  const stats = statusSummary
    ? [
      { key: 'untracked', count: statusSummary.untrackedCount, files: statusSummary.untracked },
      { key: 'unstaged', count: statusSummary.unstagedCount, files: statusSummary.unstaged },
      { key: 'staged', count: statusSummary.stagedCount, files: statusSummary.staged },
      { key: 'pushable', count: statusSummary.pushableCount, files: statusSummary.pushable },
      { key: 'conflicted', count: statusSummary.conflictedCount, files: statusSummary.conflicted },
    ]
    : [];

  return (
    <div
      ref={popupRef}
      style={{
        position: 'absolute',
        top: '30px',
        right: '8px',
        zIndex: 100,
        width: '270px',
        maxWidth: 'calc(100vw - 16px)',
        background: 'var(--vscode-editorWidget-background, var(--vscode-editor-background))',
        border: '1px solid var(--vscode-widget-border, var(--vscode-panel-border))',
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}
    >
      {/* 팝업 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 10px',
        borderBottom: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-sideBarSectionHeader-background)',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--vscode-foreground)', textTransform: 'uppercase' }}>
          GIT 상태 요약
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--vscode-descriptionForeground)', display: 'flex' }}>
          <X size={12} />
        </button>
      </div>

      {/* 상태 목록 */}
      {!statusSummary ? (
        <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
          <RefreshCw size={14} style={{ animation: 'gitcat-refresh-spin 1s linear infinite', marginBottom: '6px' }} />
          <div>불러오는 중...</div>
        </div>
      ) : (
        <div style={{ padding: '8px 0' }}>
          {stats.map(({ key, count, files }) => {
            const cfg = STATUS_CONFIG[key];
            return (
              <div key={key} style={{ padding: '4px 10px' }}>
                {/* 카테고리 행 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: count > 0 ? '3px' : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      width: '16px', height: '16px', borderRadius: '3px',
                      background: cfg.color + '22', border: `1px solid ${cfg.color}55`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '9px', fontWeight: 700, color: cfg.color, flexShrink: 0,
                    }}>
                      {cfg.short}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--vscode-foreground)' }}>{cfg.label}</span>
                  </div>
                  <span style={{
                    fontSize: '10px', fontWeight: 700,
                    color: count > 0 ? cfg.color : 'var(--vscode-descriptionForeground)',
                    background: count > 0 ? cfg.color + '22' : 'transparent',
                    padding: '1px 6px', borderRadius: '8px',
                  }}>
                    {count}
                  </span>
                </div>
                {/* 클릭 가능한 파일 목록 (최대 3개) */}
                {count > 0 && (
                  <div style={{ paddingLeft: '22px', marginBottom: '2px' }}>
                    {files.slice(0, 3).map((f) => (
                      <div
                        key={f.path}
                        onClick={() => sendMessage('OPEN_WORKSPACE_FILE', { filePath: f.path })}
                        onMouseOver={e => {
                          e.currentTarget.style.color = cfg.color;
                          e.currentTarget.style.textDecoration = 'underline';
                          e.currentTarget.style.background = cfg.color + '14';
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.color = cfg.color;
                          e.currentTarget.style.textDecoration = 'none';
                          e.currentTarget.style.background = 'transparent';
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          fontSize: '10px', color: cfg.color, opacity: 0.9,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontFamily: 'monospace', cursor: 'pointer',
                          padding: '1px 4px', borderRadius: '2px',
                          transition: 'background 0.1s',
                        }}
                        title={`${f.path} 클릭하여 파일 열기`}
                      >
                        <ExternalLink size={9} style={{ flexShrink: 0, opacity: 0.7 }} />
                        {f.path.split('/').pop()}
                      </div>
                    ))}
                    {files.length > 3 && (
                      <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', padding: '1px 4px' }}>
                        외 {files.length - 3}개...
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* 다음 액션 가이드 */}
          {statusSummary.nextAction && statusSummary.nextAction !== 'UP_TO_DATE' && (
            <div style={{
              margin: '6px 10px 2px 10px', padding: '5px 8px',
              background: 'rgba(86, 156, 214, 0.1)',
              border: '1px solid rgba(86, 156, 214, 0.3)',
              borderRadius: '4px', fontSize: '10px', color: '#569cd6',
            }}>
              💡 {
                ({
                  RESOLVE_CONFLICTS: '충돌 해결이 필요합니다',
                  ADD_CHANGES: '변경사항을 스테이징하세요',
                  COMMIT_CHANGES: '커밋할 준비가 됐습니다',
                  PULL_CHANGES: '원격 변경사항을 Pull하세요',
                  PUSH_COMMITS: 'Push할 커밋이 있습니다',
                } as Record<string, string>)[statusSummary.nextAction]
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── 파일 트리 노드 재귀 렌더러 ──────────────────────────────────────────────
// openPaths로 상태를 상위에서 관리하여 새로고침 시에도 열림/닫힘 상태가 유지됨

const TreeNode: React.FC<{
  node: WorkspaceFileTreeNode;
  depth: number;
  openPaths: Set<string>;
  onToggle: (path: string) => void;
  onFileClick: (path: string) => void;
  statusMap?: Map<string, string>;
  directoryStatusMap?: Map<string, NodeStatus>;
}> = ({ node, depth, openPaths, onToggle, onFileClick, statusMap, directoryStatusMap }) => {
  const isDir = node.type === 'directory';
  const isOpen = openPaths.has(node.path);
  const effectiveStatus = node.status || (statusMap && !isDir ? statusMap.get(node.path) : null);
  const statusCfg = effectiveStatus ? STATUS_CONFIG[effectiveStatus as string] : null;
  const directoryStatus = isDir ? directoryStatusMap?.get(node.path) : null;
  const directoryStatusCfg = directoryStatus ? STATUS_CONFIG[directoryStatus] : null;

  if (isDir) {
    return (
      <div>
        <div
          onClick={() => onToggle(node.path)}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: `2px 8px 2px ${8 + depth * 12}px`,
            cursor: 'pointer', fontSize: '12px',
            color: 'var(--vscode-foreground)',
          }}
          onMouseOver={e => e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'}
          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
        >
          {isOpen
            ? <ChevronDown size={12} style={{ flexShrink: 0, color: 'var(--vscode-descriptionForeground)' }} />
            : <ChevronRight size={12} style={{ flexShrink: 0, color: 'var(--vscode-descriptionForeground)' }} />}
          <VscFolder open={isOpen} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{node.name}</span>
          {directoryStatusCfg && (
            <span style={{
              fontSize: '9px', fontWeight: 700, color: directoryStatusCfg.color,
              background: directoryStatusCfg.color + '22', padding: '0 4px',
              borderRadius: '3px', flexShrink: 0,
            }}>
              {directoryStatusCfg.short}
            </span>
          )}
        </div>
        {isOpen && node.children?.map((child, i) => (
          <TreeNode
            key={child.path || i}
            node={child}
            depth={depth + 1}
            openPaths={openPaths}
            onToggle={onToggle}
            onFileClick={onFileClick}
            statusMap={statusMap}
            directoryStatusMap={directoryStatusMap}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      onClick={() => onFileClick(node.path)}
      style={{
        display: 'flex', alignItems: 'center', gap: '4px',
        padding: `2px 8px 2px ${8 + depth * 12}px`,
        cursor: 'pointer', fontSize: '12px',
        color: statusCfg ? statusCfg.color : 'var(--vscode-foreground)',
      }}
      onMouseOver={e => {
        e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
        e.currentTarget.style.textDecoration = 'underline';
      }}
      onMouseOut={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.textDecoration = 'none';
      }}
      title={`${node.path} 클릭하여 파일 열기`}
    >
      <VscFile color={statusCfg ? statusCfg.color : undefined} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{node.name}</span>
      {statusCfg && (
        <span style={{
          fontSize: '9px', fontWeight: 700, color: statusCfg.color,
          background: statusCfg.color + '22', padding: '0 4px',
          borderRadius: '3px', flexShrink: 0,
        }}>
          {statusCfg.short}
        </span>
      )}
    </div>
  );
};

// ── 메인 패널 ─────────────────────────────────────────────────────────────────

export const FileTreePanel: React.FC = () => {
  const { statusSummary, isRefreshingStatus, lastStatusRefreshAt } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();

  // 기본 탭: All
  const [tab, setTab] = useState<'changed' | 'all'>('all');
  const [showPopup, setShowPopup] = useState(false);
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceFileTreeNode[]>([]);
  const [workspaceRootName, setWorkspaceRootName] = useState('Workspace');
  const [workspaceTotalFiles, setWorkspaceTotalFiles] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // 트리 열림/닫힘 상태를 path Set으로 관리 → 새로고침 시 유지됨, 기본값 비어있음(모두 닫힘)
  const [openPaths, setOpenPaths] = useState<Set<string>>(new Set());

  // 토글 버튼 ref — 팝업 외부 클릭 감지 시 버튼 자신은 제외
  const triggerBtnRef = useRef<HTMLButtonElement>(null);

  const handleTogglePath = useCallback((path: string) => {
    setOpenPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // 파일 트리 로드 — openPaths는 건드리지 않아 기존 열림 상태 유지
  const loadTree = useCallback(() => {
    setIsLoading(true);
    sendMessage('GET_WORKSPACE_TREE', {});
  }, [sendMessage]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // 초기 마운트 및 Git 상태 갱신 시 상태 요약 자동 가져오기
  useEffect(() => {
    sendMessage('GET_GIT_STATUS_SUMMARY', {});
  }, [sendMessage, lastStatusRefreshAt]);

  // WORKSPACE_TREE 메시지 수신
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'WORKSPACE_TREE') {
        const { tree } = event.data.payload;
        setWorkspaceTree(tree.nodes ?? []);
        setWorkspaceRootName(tree.rootName ?? 'Workspace');
        setWorkspaceTotalFiles(tree.totalFiles ?? 0);
        setIsLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Explorer에 실제 보이는 파일 경로 집합 (WORKSPACE_TREE 기준)
  const visibleFilePaths = React.useMemo(() => {
    const result = new Set<string>();
    const walk = (nodes: WorkspaceFileTreeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'file') result.add(node.path);
        if (node.children && node.children.length > 0) {
          walk(node.children as WorkspaceFileTreeNode[]);
        }
      }
    };
    walk(workspaceTree);
    return result;
  }, [workspaceTree]);

  // Changed 탭: 상태가 있는 파일 중 Explorer에 보이는 파일만 렌더링
  const changedFiles: WorkspaceFileTreeNode[] = statusSummary
    ? [
      ...statusSummary.staged.map(f => ({ name: f.path.split('/').pop() ?? f.path, path: f.path, type: 'file' as const, status: 'staged' as any })),
      ...statusSummary.unstaged.map(f => ({ name: f.path.split('/').pop() ?? f.path, path: f.path, type: 'file' as const, status: 'unstaged' as any })),
      ...statusSummary.untracked.map(f => ({ name: f.path.split('/').pop() ?? f.path, path: f.path, type: 'file' as const, status: 'untracked' as any })),
      ...statusSummary.conflicted.map(f => ({ name: f.path.split('/').pop() ?? f.path, path: f.path, type: 'file' as const, status: 'conflicted' as any })),
    ].filter((f) => visibleFilePaths.has(f.path))
    : [];

  const statusMap = React.useMemo(() => {
    const map = new Map<string, NodeStatus>();
    if (!statusSummary) return map;

    // 우선순위 덮어쓰기 (낮은 우선순위 -> 높은 우선순위)
    statusSummary.untracked.forEach(f => map.set(f.path, 'untracked'));
    statusSummary.unstaged.forEach(f => map.set(f.path, 'unstaged'));
    statusSummary.staged.forEach(f => map.set(f.path, 'staged'));
    statusSummary.conflicted.forEach(f => map.set(f.path, 'conflicted'));
    return map;
  }, [statusSummary]);

  const directoryStatusMap = React.useMemo(() => {
    const map = new Map<string, NodeStatus>();
    const priority: Record<NodeStatus, number> = {
      untracked: 1,
      unstaged: 2,
      staged: 3,
      conflicted: 4,
    };

    const setWithPriority = (path: string, status: NodeStatus) => {
      const prev = map.get(path);
      if (!prev || priority[status] > priority[prev]) map.set(path, status);
    };

    statusMap.forEach((status, filePath) => {
      const segments = filePath.split('/').filter(Boolean);
      let current = '';
      for (let i = 0; i < segments.length - 1; i += 1) {
        current = current ? `${current}/${segments[i]}` : segments[i];
        setWithPriority(current, status);
      }
      setWithPriority('__gitcat_root__', status);
    });

    return map;
  }, [statusMap]);

  const handleFileClick = (path: string) => {
    sendMessage('OPEN_WORKSPACE_FILE', { filePath: path });
  };

  const changedCount = changedFiles.length;
  const allCount = workspaceTotalFiles > 0 ? workspaceTotalFiles : visibleFilePaths.size;
  const rootNode: WorkspaceFileTreeNode = {
    name: workspaceRootName,
    path: '__gitcat_root__',
    type: 'directory',
    children: workspaceTree,
  };

  useEffect(() => {
    if (workspaceTree.length === 0) return;
    setOpenPaths((prev) => {
      if (prev.has('__gitcat_root__')) return prev;
      const next = new Set(prev);
      next.add('__gitcat_root__');
      return next;
    });
  }, [workspaceTree]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── 한 줄: All / Changed (왼쪽) + 트리 새로고침 + Git 상태 요약 (오른쪽) ── */}
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        padding: '6px 8px 0 8px',
      }}>
        <div style={{
          display: 'flex',
          background: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: '6px',
          padding: '2px',
          gap: '2px',
          flexShrink: 0,
          minWidth: 0,
        }}>
          {(['all', 'changed'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: '11px',
                fontWeight: tab === t ? 600 : 400,
                padding: '3px 10px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                background: tab === t
                  ? 'var(--vscode-button-background)'
                  : 'transparent',
                color: tab === t
                  ? 'var(--vscode-button-foreground)'
                  : 'var(--vscode-descriptionForeground)',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {t === 'all'
                ? `All${allCount > 0 ? ` ${allCount}` : ''}`
                : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {`Changed${changedCount > 0 ? ` ${changedCount}` : ''}`}
                    {t === 'changed' && isRefreshingStatus && (
                      <RefreshCw size={10} style={{ animation: 'gitcat-refresh-spin 1s linear infinite' }} />
                    )}
                  </span>
                )}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
          <button
            onClick={loadTree}
            disabled={isLoading}
            style={{
              background: 'none', border: 'none', cursor: isLoading ? 'wait' : 'pointer',
              padding: '3px', color: 'var(--vscode-descriptionForeground)', display: 'flex',
              opacity: isLoading ? 0.6 : 1,
            }}
            title="파일 트리 새로고침 (열림/닫힘 상태 유지)"
          >
            <RefreshCw size={11} style={{ animation: isLoading ? 'gitcat-refresh-spin 1s linear infinite' : 'none' }} />
          </button>
          <button
            ref={triggerBtnRef}
            onClick={() => {
              const next = !showPopup;
              setShowPopup(next);
              if (next) sendMessage('GET_GIT_STATUS_SUMMARY', {});
            }}
            title={showPopup ? 'Git 상태 요약 닫기' : 'Git 상태 요약 보기'}
            style={{
              background: showPopup ? 'var(--vscode-button-background)' : 'none',
              border: 'none',
              borderRadius: '4px', cursor: 'pointer', padding: '3px',
              color: showPopup ? 'var(--vscode-button-foreground)' : 'var(--vscode-descriptionForeground)',
              display: 'flex', alignItems: 'center',
              transition: 'all 0.15s',
              outline: showPopup ? '1px solid var(--vscode-focusBorder)' : 'none',
            }}
            onMouseOver={e => { if (!showPopup) (e.currentTarget as HTMLButtonElement).style.outline = '1px solid var(--vscode-focusBorder)'; }}
            onMouseOut={e => { if (!showPopup) (e.currentTarget as HTMLButtonElement).style.outline = 'none'; }}
          >
            <BarChart2 size={14} />
          </button>
        </div>

        {showPopup && (
          <StatusSummaryPopup
            onClose={() => setShowPopup(false)}
            triggerRef={triggerBtnRef}
          />
        )}
      </div>

      {/* ── 구분선 ── */}
      <div style={{ height: '1px', background: 'var(--vscode-panel-border)', margin: '6px 0 0 0' }} />

      {/* ── 파일 목록 / 트리 ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--vscode-descriptionForeground)', fontSize: '12px' }}>
            <RefreshCw size={16} style={{ animation: 'gitcat-refresh-spin 1s linear infinite', marginBottom: '8px' }} />
            <div>로딩 중...</div>
          </div>
        ) : tab === 'changed' ? (
          changedFiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--vscode-descriptionForeground)', fontSize: '11px' }}>
              변경된 파일이 없습니다
            </div>
          ) : (
            changedFiles.map((f, i) => (
              <TreeNode
                key={f.path || i}
                node={f}
                depth={0}
                openPaths={openPaths}
                onToggle={handleTogglePath}
                onFileClick={handleFileClick}
              />
            ))
          )
        ) : (
          workspaceTree.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--vscode-descriptionForeground)', fontSize: '11px' }}>
              파일을 불러오는 중...
            </div>
          ) : (
            <TreeNode
              key={rootNode.path}
              node={rootNode}
              depth={0}
              openPaths={openPaths}
              onToggle={handleTogglePath}
              onFileClick={handleFileClick}
              statusMap={statusMap}
              directoryStatusMap={directoryStatusMap}
            />
          )
        )}
      </div>

      <style>{`
        @keyframes gitcat-refresh-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
