import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Settings, X } from 'lucide-react';
import type { OutboundPayload } from '@gitcat/shared-types';

export type PrFormMetadataPayload = OutboundPayload<'PR_FORM_METADATA'>;

const MAX_REVIEWERS = 15;
const MAX_ASSIGNEES = 10;

type PopoverKind = 'reviewers' | 'assignees' | 'labels' | 'milestone' | null;

function labelColorHex(color: string): string {
  const raw = (color || 'ededed').replace(/^#/, '');
  return `#${raw}`;
}

const popoverBase: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  top: '100%',
  marginTop: 6,
  width: 300,
  maxHeight: 320,
  overflowY: 'auto',
  zIndex: 20,
  background: 'var(--vscode-editorWidget-background, var(--vscode-editor-background))',
  border: '1px solid var(--vscode-widget-border, var(--vscode-panel-border))',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
  boxSizing: 'border-box',
};

const sectionDivider: React.CSSProperties = {
  borderTop: '1px solid var(--vscode-panel-border)',
  margin: '0 0 10px 0',
};

interface PrCreateMetadataSidebarProps {
  metadata: PrFormMetadataPayload | null;
  loading: boolean;
  disabled: boolean;
  reviewers: string[];
  assignees: string[];
  labels: string[];
  milestoneNumber: number | null;
  onReviewersChange: (next: string[]) => void;
  onAssigneesChange: (next: string[]) => void;
  onLabelsChange: (next: string[]) => void;
  onMilestoneChange: (next: number | null) => void;
  onRetryLoad?: () => void;
}

export const PrCreateMetadataSidebar: React.FC<PrCreateMetadataSidebarProps> = ({
  metadata,
  loading,
  disabled,
  reviewers,
  assignees,
  labels,
  milestoneNumber,
  onReviewersChange,
  onAssigneesChange,
  onLabelsChange,
  onMilestoneChange,
  onRetryLoad,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const wasMetadataLoading = useRef(false);
  const [openKind, setOpenKind] = useState<PopoverKind>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (loading) wasMetadataLoading.current = true;
  }, [loading]);

  const showMetadataRetry =
    Boolean(onRetryLoad) && !loading && metadata == null && wasMetadataLoading.current;

  useEffect(() => {
    setFilter('');
  }, [openKind]);

  useEffect(() => {
    if (!openKind) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenKind(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, [openKind]);

  const loginMap = useMemo(() => {
    const m = new Map<string, PrFormMetadataPayload['collaborators'][number]>();
    for (const c of metadata?.collaborators ?? []) {
      m.set(c.login, c);
    }
    return m;
  }, [metadata]);

  const filteredCollaborators = useMemo(() => {
    const list = metadata?.collaborators ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => c.login.toLowerCase().includes(q));
  }, [metadata, filter]);

  // Reviewers 후보에서는 GitHub이 거절하는 본인을 항상 제외한다.
  // (Assignees는 self-assign이 허용되므로 그대로 둔다.)
  const reviewerCandidates = useMemo(() => {
    const me = metadata?.currentUserLogin ?? null;
    if (!me) return filteredCollaborators;
    return filteredCollaborators.filter((c) => c.login !== me);
  }, [filteredCollaborators, metadata]);

  const filteredLabels = useMemo(() => {
    const list = metadata?.labels ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q)),
    );
  }, [metadata, filter]);

  const filteredMilestones = useMemo(() => {
    const list = metadata?.milestones ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((m) => m.title.toLowerCase().includes(q));
  }, [metadata, filter]);

  const milestoneTitle =
    milestoneNumber == null
      ? null
      : (metadata?.milestones ?? []).find((m) => m.number === milestoneNumber)?.title ?? `#${milestoneNumber}`;

  const toggleLogin = (login: string, selected: string[], max: number, onChange: (v: string[]) => void) => {
    if (selected.includes(login)) {
      onChange(selected.filter((x) => x !== login));
      return;
    }
    if (selected.length >= max) return;
    onChange([...selected, login]);
  };

  const toggleLabel = (name: string) => {
    if (labels.includes(name)) {
      onLabelsChange(labels.filter((x) => x !== name));
    } else {
      onLabelsChange([...labels, name]);
    }
  };

  const renderGear = (kind: Exclude<PopoverKind, null>) => (
    <button
      type="button"
      aria-label={`${kind} 설정`}
      disabled={disabled || loading}
      onClick={() => setOpenKind((k) => (k === kind ? null : kind))}
      style={{
        border: 'none',
        background: 'transparent',
        padding: 4,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        color: 'var(--vscode-textLink-foreground)',
        opacity: disabled || loading ? 0.45 : 1,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Settings size={15} />
    </button>
  );

  const renderUserChips = (logins: string[], onRemove: (login: string) => void) => {
    if (logins.length === 0) {
      return (
        <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', padding: '2px 0' }}>
          없음
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {logins.map((login) => {
          const av = loginMap.get(login)?.avatarUrl;
          return (
            <div
              key={login}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 8px 3px 4px',
                borderRadius: 999,
                background: 'var(--vscode-input-background)',
                border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
                fontSize: 12,
              }}
            >
              {av ? (
                <img src={av} alt="" width={18} height={18} style={{ borderRadius: '50%' }} />
              ) : (
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'var(--vscode-badge-background)',
                  }}
                />
              )}
              <span style={{ fontWeight: 500 }}>{login}</span>
              <button
                type="button"
                aria-label={`${login} 제거`}
                disabled={disabled}
                onClick={() => onRemove(login)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  color: 'var(--vscode-foreground)',
                  display: 'flex',
                  lineHeight: 1,
                }}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderLabelChips = () => {
    if (labels.length === 0) {
      return (
        <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', padding: '2px 0' }}>
          없음
        </div>
      );
    }
    const labelMeta = new Map((metadata?.labels ?? []).map((l) => [l.name, l]));
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {labels.map((name) => {
          const meta = labelMeta.get(name);
          const hex = labelColorHex(meta?.color ?? 'ededed');
          return (
            <div
              key={name}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 8px 3px 6px',
                borderRadius: 999,
                background: 'var(--vscode-input-background)',
                border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
                fontSize: 12,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: hex,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 600 }}>{name}</span>
              <button
                type="button"
                aria-label={`라벨 ${name} 제거`}
                disabled={disabled}
                onClick={() => onLabelsChange(labels.filter((x) => x !== name))}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                }}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const sectionHeader = (title: string, kind: Exclude<PopoverKind, null>) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--vscode-foreground)' }}>{title}</span>
      {renderGear(kind)}
    </div>
  );

  const popoverFilterInput = (
    <input
      value={filter}
      onChange={(e) => setFilter(e.target.value)}
      placeholder={openKind === 'labels' ? '라벨 검색' : openKind === 'milestone' ? '마일스톤 검색' : '사용자 검색'}
      autoFocus
      style={{
        width: '100%',
        boxSizing: 'border-box',
        marginBottom: 8,
        padding: '7px 10px',
        fontSize: 12,
        borderRadius: 6,
        border: '1px solid var(--vscode-focusBorder)',
        background: 'var(--vscode-input-background)',
        color: 'var(--vscode-input-foreground)',
        outline: 'none',
      }}
    />
  );

  const userListRows = (
    list: PrFormMetadataPayload['collaborators'],
    selected: string[],
    max: number,
    onChange: (v: string[]) => void,
    hint: string,
  ) => (
    <>
      <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginBottom: 6, lineHeight: 1.4 }}>
        {hint}
      </div>
      {popoverFilterInput}
      {list.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', padding: '8px 0' }}>
          표시할 사용자가 없습니다.
        </div>
      ) : (
        list.map((c) => {
          const isOn = selected.includes(c.login);
          const atCap = !isOn && selected.length >= max;
          return (
            <button
              key={c.login}
              type="button"
              disabled={disabled || atCap}
              onClick={() => toggleLogin(c.login, selected, max, onChange)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                textAlign: 'left',
                padding: '8px 6px',
                border: 'none',
                borderBottom: '1px solid var(--vscode-panel-border)',
                background: isOn ? 'var(--vscode-list-inactiveSelectionBackground)' : 'transparent',
                color: 'var(--vscode-foreground)',
                cursor: disabled || atCap ? 'not-allowed' : 'pointer',
                fontSize: 12,
              }}
            >
              <span style={{ width: 16, display: 'flex', justifyContent: 'center' }}>
                {isOn ? <Check size={14} /> : null}
              </span>
              {c.avatarUrl ? (
                <img src={c.avatarUrl} alt="" width={22} height={22} style={{ borderRadius: '50%' }} />
              ) : (
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--vscode-badge-background)' }} />
              )}
              <span style={{ fontWeight: 600 }}>{c.login}</span>
            </button>
          );
        })
      )}
    </>
  );

  return (
    <div
      ref={rootRef}
      style={{
        flex: '0 0 300px',
        width: '100%',
        maxWidth: 340,
        position: 'relative',
        alignSelf: 'flex-start',
      }}
    >
      <div
        style={{
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: 8,
          padding: '12px 14px',
          background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
        }}
      >
        {loading && (
          <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', marginBottom: 10 }}>
            GitHub에서 목록을 불러오는 중…
          </div>
        )}

        {!loading && !metadata && onRetryLoad && showMetadataRetry && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--vscode-errorForeground)', marginBottom: 6 }}>
              메타데이터를 불러오지 못했습니다.
            </div>
            <button
              type="button"
              onClick={onRetryLoad}
              style={{
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid var(--vscode-button-border, transparent)',
                background: 'var(--vscode-button-secondaryBackground)',
                color: 'var(--vscode-button-secondaryForeground)',
                cursor: 'pointer',
              }}
            >
              다시 시도
            </button>
          </div>
        )}

        <div style={{ position: 'relative', marginBottom: 14 }}>
          {sectionHeader('Reviewers', 'reviewers')}
          {renderUserChips(reviewers, (login) => onReviewersChange(reviewers.filter((x) => x !== login)))}
          {openKind === 'reviewers' && (
            <div style={{ ...popoverBase, padding: '10px 10px 6px' }}>
              {userListRows(
                reviewerCandidates,
                reviewers,
                MAX_REVIEWERS,
                onReviewersChange,
                metadata?.currentUserLogin
                  ? `최대 ${MAX_REVIEWERS}명까지 요청할 수 있습니다. PR 작성자(${metadata.currentUserLogin}) 본인은 목록에서 제외됩니다.`
                  : `최대 ${MAX_REVIEWERS}명까지 요청할 수 있습니다.`,
              )}
            </div>
          )}
        </div>

        <div style={sectionDivider} />

        <div style={{ position: 'relative', marginBottom: 14 }}>
          {sectionHeader('Assignees', 'assignees')}
          {renderUserChips(assignees, (login) => onAssigneesChange(assignees.filter((x) => x !== login)))}
          {openKind === 'assignees' && (
            <div style={{ ...popoverBase, padding: '10px 10px 6px' }}>
              <button
                type="button"
                disabled={disabled || assignees.length === 0}
                onClick={() => onAssigneesChange([])}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '6px 4px 10px',
                  border: 'none',
                  borderBottom: '1px solid var(--vscode-panel-border)',
                  background: 'transparent',
                  color: 'var(--vscode-foreground)',
                  fontSize: 12,
                  cursor: assignees.length === 0 ? 'not-allowed' : 'pointer',
                  marginBottom: 4,
                }}
              >
                <X size={14} /> 담당자 지우기
              </button>
              {userListRows(
                filteredCollaborators,
                assignees,
                MAX_ASSIGNEES,
                onAssigneesChange,
                `최대 ${MAX_ASSIGNEES}명까지 지정할 수 있습니다.`,
              )}
            </div>
          )}
        </div>

        <div style={sectionDivider} />

        <div style={{ position: 'relative', marginBottom: 14 }}>
          {sectionHeader('Labels', 'labels')}
          {renderLabelChips()}
          {openKind === 'labels' && (
            <div style={{ ...popoverBase, padding: '10px 10px 6px' }}>
              <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginBottom: 6 }}>
                이 PR에 적용할 라벨을 선택하세요.
              </div>
              {popoverFilterInput}
              {filteredLabels.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', padding: '8px 0' }}>
                  라벨이 없습니다.
                </div>
              ) : (
                filteredLabels.map((l) => {
                  const isOn = labels.includes(l.name);
                  const hex = labelColorHex(l.color);
                  return (
                    <button
                      key={l.name}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleLabel(l.name)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 6px',
                        border: 'none',
                        borderBottom: '1px solid var(--vscode-panel-border)',
                        background: isOn ? 'var(--vscode-list-inactiveSelectionBackground)' : 'transparent',
                        color: 'var(--vscode-foreground)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <span style={{ width: 16, display: 'flex', justifyContent: 'center', marginTop: 2 }}>
                        {isOn ? <Check size={14} /> : null}
                      </span>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: hex, marginTop: 3, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{l.name}</div>
                        {l.description ? (
                          <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 2, lineHeight: 1.35 }}>
                            {l.description}
                          </div>
                        ) : null}
                      </span>
                      {isOn ? (
                        <button
                          type="button"
                          aria-label={`${l.name} 제거`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onLabelsChange(labels.filter((x) => x !== l.name));
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            padding: 2,
                            cursor: 'pointer',
                            color: 'var(--vscode-foreground)',
                          }}
                        >
                          <X size={14} />
                        </button>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div style={sectionDivider} />

        <div style={{ position: 'relative' }}>
          {sectionHeader('Milestone', 'milestone')}
          <div style={{ fontSize: 12, color: milestoneTitle ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)' }}>
            {milestoneTitle ?? '없음'}
          </div>
          {openKind === 'milestone' && (
            <div style={{ ...popoverBase, padding: '10px 10px 6px' }}>
              <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginBottom: 6 }}>
                열린 마일스톤만 표시됩니다.
              </div>
              {popoverFilterInput}
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onMilestoneChange(null);
                  setOpenKind(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '8px 6px',
                  border: 'none',
                  borderBottom: '1px solid var(--vscode-panel-border)',
                  background: milestoneNumber == null ? 'var(--vscode-list-inactiveSelectionBackground)' : 'transparent',
                  color: 'var(--vscode-foreground)',
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ width: 18, display: 'flex', justifyContent: 'center' }}>
                  {milestoneNumber == null ? <Check size={14} /> : null}
                </span>
                마일스톤 없음
              </button>
              {filteredMilestones.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', padding: '8px 0' }}>
                  열린 마일스톤이 없습니다.
                </div>
              ) : (
                filteredMilestones.map((m) => {
                  const isOn = milestoneNumber === m.number;
                  return (
                    <button
                      key={m.number}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        onMilestoneChange(m.number);
                        setOpenKind(null);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 6px',
                        border: 'none',
                        borderBottom: '1px solid var(--vscode-panel-border)',
                        background: isOn ? 'var(--vscode-list-inactiveSelectionBackground)' : 'transparent',
                        color: 'var(--vscode-foreground)',
                        fontSize: 12,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <span style={{ width: 16, display: 'flex', justifyContent: 'center' }}>
                        {isOn ? <Check size={14} /> : null}
                      </span>
                      <span style={{ fontWeight: 600 }}>{m.title}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
