import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GitBranch, Plus, ArrowUp, GitMerge, Check, Sparkles, ChevronDown, ChevronUp, X, CornerDownRight, Clock, RefreshCw, AlertCircle, RotateCw, ExternalLink, GitPullRequest, Lock } from 'lucide-react';
import { useGitCatStore, type GitPanelPendingOperation } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { btn, bigBtn, inlineBtn, vscodeSidebarViewTitleForeground, webviewBodyForeground, webviewDescriptionForeground } from '../../shared/styles';
import { useSidebarSectionNotificationMode } from '../../app/SidebarSectionNotificationContext';
import { SectionNotificationBanner } from '../common/SectionNotificationBanner';
import { GitWorkflowStepper } from './GitWorkflowStepper';
import { t } from '../../i18n';

function toastCompletesPending(message: string, ok: boolean, pending: GitPanelPendingOperation | null): boolean {
  if (!ok) return true;
  if (!pending) return false;
  const m = message;
  switch (pending) {
    case 'add':
      return /스테이징/.test(m) || /staged/i.test(m);
    case 'commit':
      return /커밋/.test(m) && /완료/.test(m);
    case 'push':
      return /push/i.test(m) && /완료/.test(m);
    case 'pull':
      return /pull/i.test(m) && /완료/.test(m);
    case 'merge':
      return /병합/.test(m);
    default:
      return false;
  }
}

export const GitActionPanel: React.FC = () => {
  const {
    currentBranch,
    currentWorktreePath,
    branches,
    worktrees,
    sectionNotifications,
    clearSectionNotification,
    isRefreshingStatus,
    isPulling,
    isStaging,
    isCommitting,
    isPushing,
    isMerging,
    lastStatusRefreshAt,
    stagedCount,
    statusSummary,
    isLoadingStatusSummary,
    mergeResult,
    clearMergeResult,
    aiBranchSuggestions,
    branchSuggestionNonce,
    isBranchRecommendationLoading,
    isCommitRecommendationLoading,
    aiCommitSuggestion,
    aiCommitAlternatives,
    aiCommitSuggestedBranchNames,
    commitSuggestionNonce,
    branchRecommendationError,
    commitRecommendationError,
    clearBranchSuggestions,
    clearCommitSuggestions,
    clearGitPanelOperationLoading,
    postGitSectionBanner,
    beginRecommendationRequest,
    clearBranchRecommendationError,
    clearCommitRecommendationError,
  } = useGitCatStore();
  const dismissGitNotification = useCallback(() => clearSectionNotification('git'), [clearSectionNotification]);
  const { showSectionBannersInline } = useSidebarSectionNotificationMode();
  const { sendMessage } = useVsCodeApi();
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [branchNameError, setBranchNameError] = useState<string | null>(null);
  const [showBranchAI, setShowBranchAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showCommitForm, setShowCommitForm] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [isBranchListOpen, setIsBranchListOpen] = useState(false);
  const [isRefreshPressed, setIsRefreshPressed] = useState(false);
  const [checkoutingBranch, setCheckoutingBranch] = useState<string | null>(null);
  const [showMergeForm, setShowMergeForm] = useState(false);
  // source: 병합할 브랜치(FROM), target: 기준 브랜치(INTO, 기본값: currentBranch)
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState(currentBranch);
  /** OPEN_PR_PANEL은 extension에서 LOADING을 주지 않아 Pull과 동일한 피드백을 로컬로 짧게 표시 */
  const [isOpeningPrPanel, setIsOpeningPrPanel] = useState(false);
  /** Git Commit 그리드 버튼 — 폼 오픈 시 짧은 회전 (Pull과 유사한 피드백) */
  const [isCommitGridPressed, setIsCommitGridPressed] = useState(false);
  /** Merge 그리드 버튼 — 폼 오픈 시 짧은 회전 */
  const [isMergeGridPressed, setIsMergeGridPressed] = useState(false);
  /** Merge 실행 후 로딩 사이클이 끝나면 폼 닫기 */
  const mergePendingCloseRef = useRef(false);
  const mergeSawLoadingRef = useRef(false);
  const latestCommitSuggestionNonceRef = useRef(0);
  const latestBranchSuggestionNonceRef = useRef(0);

  const pendingGitOpRef = useRef<GitPanelPendingOperation | null>(null);
  const gitPanelBusyRef = useRef(false);
  const [gitPanelBusy, setGitPanelBusy] = useState(false);

  const unlockGitPanel = useCallback(() => {
    pendingGitOpRef.current = null;
    gitPanelBusyRef.current = false;
    setGitPanelBusy(false);
  }, []);

  const lockGitPanel = useCallback((op: GitPanelPendingOperation) => {
    pendingGitOpRef.current = op;
    gitPanelBusyRef.current = true;
    setGitPanelBusy(true);
  }, []);

  useEffect(() => {
    if (!isOpeningPrPanel) return;
    const t = window.setTimeout(() => setIsOpeningPrPanel(false), 900);
    return () => window.clearTimeout(t);
  }, [isOpeningPrPanel]);

  useEffect(() => {
    if (!isCommitGridPressed) return;
    const t = window.setTimeout(() => setIsCommitGridPressed(false), 700);
    return () => window.clearTimeout(t);
  }, [isCommitGridPressed]);

  useEffect(() => {
    if (!isMergeGridPressed) return;
    const t = window.setTimeout(() => setIsMergeGridPressed(false), 700);
    return () => window.clearTimeout(t);
  }, [isMergeGridPressed]);

  // 브랜치 체크아웃 완료 시 로딩 상태 해제
  useEffect(() => {
    setCheckoutingBranch(null);
  }, [currentBranch]);

  // 브랜치 전환 실패 시에도 "전환 중..."을 즉시 해제
  useEffect(() => {
    if (!checkoutingBranch) return;
    const notice = sectionNotifications.git;
    if (!notice) return;
    if (notice.type === 'error') {
      setCheckoutingBranch(null);
    }
  }, [sectionNotifications.git, checkoutingBranch]);

  // 예외 케이스 방지: 체크아웃 응답이 오지 않으면 로컬 상태를 자동 해제
  useEffect(() => {
    if (!checkoutingBranch) return;
    const t = window.setTimeout(() => setCheckoutingBranch(null), 12000);
    return () => window.clearTimeout(t);
  }, [checkoutingBranch]);

  useEffect(() => {
    sendMessage('GET_WORKTREE_LIST', {});
  }, [sendMessage, lastStatusRefreshAt]);

  const requestStatusSummary = useCallback((fetchRemote = false) => {
    sendMessage('GET_GIT_STATUS_SUMMARY', { fetchRemote });
  }, [sendMessage]);

  useEffect(() => {
    if (!currentBranch) return;
    const t = window.setTimeout(() => requestStatusSummary(false), 150);
    return () => window.clearTimeout(t);
  }, [currentBranch, lastStatusRefreshAt, requestStatusSummary]);

  const closeAIPrompt = () => {
    setShowBranchAI(false);
    setAiPrompt('');
  };

  const closeBranchForm = () => {
    setShowNewBranch(false);
    setNewBranchName('');
    setBranchNameError(null);
    clearBranchSuggestions();
    clearBranchRecommendationError();
    closeAIPrompt();
  };

  const closeCommitForm = () => {
    setShowCommitForm(false);
    setCommitMessage('');
    clearCommitSuggestions();
    clearCommitRecommendationError();
    closeAIPrompt();
  };

  const closeMergeForm = () => {
    mergePendingCloseRef.current = false;
    mergeSawLoadingRef.current = false;
    setShowMergeForm(false);
    setMergeSource('');
    setMergeTarget(currentBranch);
  };

  useEffect(() => {
    if (!mergePendingCloseRef.current) return;
    if (isMerging) {
      mergeSawLoadingRef.current = true;
      return;
    }
    if (mergeSawLoadingRef.current) {
      closeMergeForm();
    }
  }, [isMerging, currentBranch]);

  useEffect(() => {
    if (!gitPanelBusy) return;
    const t = window.setTimeout(() => {
      const op = pendingGitOpRef.current;
      if (op) clearGitPanelOperationLoading(op);
      unlockGitPanel();
    }, 45000);
    return () => window.clearTimeout(t);
  }, [gitPanelBusy, unlockGitPanel, clearGitPanelOperationLoading]);

  useEffect(() => {
    const n = sectionNotifications.git;
    if (!n || !gitPanelBusyRef.current) return;
    const ok = n.type !== 'error';
    if (!ok || toastCompletesPending(n.message, ok, pendingGitOpRef.current)) {
      const op = pendingGitOpRef.current;
      if (op) clearGitPanelOperationLoading(op);
      unlockGitPanel();
      if (ok) requestStatusSummary(true);
    }
  }, [sectionNotifications.git, clearGitPanelOperationLoading, unlockGitPanel, requestStatusSummary]);

  useEffect(() => {
    if (!showCommitForm) return;
    if (commitSuggestionNonce === latestCommitSuggestionNonceRef.current) return;
    latestCommitSuggestionNonceRef.current = commitSuggestionNonce;
    if (aiCommitSuggestion.trim()) {
      setCommitMessage(aiCommitSuggestion);
    }
  }, [showCommitForm, commitSuggestionNonce, aiCommitSuggestion]);

  useEffect(() => {
    if (!showNewBranch || showCommitForm) return;
    if (branchSuggestionNonce === latestBranchSuggestionNonceRef.current) return;
    latestBranchSuggestionNonceRef.current = branchSuggestionNonce;
    const first = (aiBranchSuggestions[0] ?? '').trim();
    if (!first) return;
    setNewBranchName(first);
    setBranchNameError(null);
  }, [showNewBranch, showCommitForm, branchSuggestionNonce, aiBranchSuggestions]);

  const handleGitAdd = () => {
    lockGitPanel('add');
    sendMessage('GIT_ADD_ALL', {});
  };

  const handleCommit = () => {
    if (showCommitForm) {
      if (!commitMessage.trim()) return;
      if (stagedCount === 0) {
        postGitSectionBanner({ type: 'warning', message: t('git.commit.stageRequired') });
        return;
      }
      lockGitPanel('commit');
      sendMessage('EXECUTE_COMMIT', { message: commitMessage });
      closeCommitForm();
    } else {
      closeBranchForm();
      closeMergeForm();
      setShowCommitForm(true);
    }
  };

  const handlePush = () => {
    lockGitPanel('push');
    sendMessage('GIT_PUSH', {});
  };

  const handlePull = () => {
    lockGitPanel('pull');
    sendMessage('EXECUTE_PULL', {});
  };

  const handleRunMerge = () => {
    if (!mergeSource || !mergeTarget) return;
    if (mergeSource === mergeTarget) {
      postGitSectionBanner({ type: 'warning', message: t('git.merge.sameBranch') });
      return;
    }
    mergePendingCloseRef.current = true;
    mergeSawLoadingRef.current = false;
    lockGitPanel('merge');
    sendMessage('RUN_MERGE', { source: mergeSource, target: mergeTarget });
  };

  const refreshStatusLabel = isRefreshingStatus
    ? t('git.refreshing')
    : lastStatusRefreshAt
      ? t('git.updatedAt', { time: formatRefreshTime(lastStatusRefreshAt) })
      : t('git.notRefreshed');

  const isRefreshActive = isRefreshingStatus || isRefreshPressed;
  const handleRefreshStatus = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsRefreshPressed(true);
    sendMessage('REFRESH_STATUS', { fetchRemote: true });
    requestStatusSummary(true);
    window.setTimeout(() => setIsRefreshPressed(false), 700);
  };

  const handleCreateBranch = () => {
    const candidate = newBranchName.trim();
    if (!candidate) return;
    if (/\s/.test(candidate)) {
      const message = t('git.newBranch.invalidWhitespace');
      setBranchNameError(message);
      postGitSectionBanner({ type: 'error', message });
      return;
    }
    setBranchNameError(null);
    sendMessage('APPLY_BRANCH', { name: candidate });
    closeBranchForm();
  };

  const applyBranchCandidate = (name: string) => {
    const value = name.trim();
    if (!value) return;
    setNewBranchName(value);
  };

  const selectableBranches = branches.filter((branch) => branch.name !== currentBranch && !branch.isRemote);
  const displayWorktrees = worktrees;

  const compactPath = (path: string): string => {
    const normalized = path.replace(/\\/g, '/');
    const chunks = normalized.split('/').filter(Boolean);
    if (chunks.length <= 3) return normalized;
    return `.../${chunks.slice(-3).join('/')}`;
  };

  const handleAISubmit = () => {
    const prompt = aiPrompt.trim();
    if (showCommitForm) {
      // RECOMMEND_COMMIT 스키마: { diffText: string, tag?: string }
      beginRecommendationRequest('commit');
      sendMessage('RECOMMEND_COMMIT', prompt ? { prompt } : {});
      closeAIPrompt();
      return;
    }

    if (!prompt) return;
    // RECOMMEND_BRANCH 스키마: { purpose: string }
    const draft = newBranchName.trim();
    const purpose = draft
      ? `${prompt}\n\nbranch-name-draft: ${draft}`
      : prompt;
    beginRecommendationRequest('branch');
    sendMessage('RECOMMEND_BRANCH', { purpose });

    closeAIPrompt();
  };

  const aiPromptPlaceholder = showCommitForm
    ? '어떤 기능을 구현하셨나요? commit에 넣을 내용을 정리해서 입력해주세요.'
    : '어떤 기능을 구현하실 예정인가요? branch에 넣을 내용을 정리해서 입력해주세요.';

  const isGitConnected = currentBranch !== '';
  const isRecommendationLoading =
    showCommitForm ? isCommitRecommendationLoading : isBranchRecommendationLoading;
  const isCheckoutPending = !!checkoutingBranch;

  return (
    <div
      className="animate-fade-in"
      style={{ padding: '8px 4px', color: webviewBodyForeground }}
    >
      {isGitConnected && (
        <GitWorkflowStepper
          statusSummary={statusSummary}
          isLoading={isRefreshingStatus && !statusSummary}
          isLoadingSummary={isLoadingStatusSummary}
          isStaging={isStaging}
          isCommitting={isCommitting}
          isPushing={isPushing}
        />
      )}

      {/* ── Branch Selector Accordion Header ── */}
      <div>
        <div
          onClick={() => setIsBranchListOpen(!isBranchListOpen)}
          title={isBranchListOpen ? '브랜치·워크트리 목록 접기' : '브랜치·워크트리 목록 펼치기 · 다른 로컬 브랜치로 전환'}
          style={{
            margin: isBranchListOpen ? '0 8px 0 8px' : '0 8px 0 8px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 8px 7px 10px',
            borderRadius: isBranchListOpen ? '4px 4px 0 0' : '4px',
            border: '1px solid var(--vscode-panel-border)',
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            cursor: 'pointer', transition: 'all 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'}
          onMouseOut={e => e.currentTarget.style.borderColor = 'var(--vscode-panel-border)'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <GitBranch
              size={15}
              style={{
                color: isGitConnected ? 'var(--vscode-charts-blue)' : 'var(--vscode-input-foreground)',
                opacity: isGitConnected ? 1 : 0.72,
                flexShrink: 0,
              }}
            />
            <span style={{
              fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: 'var(--vscode-input-foreground)',
              opacity: isGitConnected ? 1 : 0.72,
            }}>
              {isGitConnected ? currentBranch : t('git.currentBranchMissing')}
            </span>
            {isCheckoutPending && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: 'var(--vscode-charts-blue)',
                  flexShrink: 0,
                }}
              >
                {t('git.switching')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              aria-label="Git 상태 새로고침"
              title="Git 상태 새로고침 (브랜치·스테이징 정보를 다시 불러옵니다)"
              onClick={handleRefreshStatus}
              disabled={isRefreshingStatus || !isGitConnected}
              style={iconBtnStyle(isRefreshActive)}
            >
              <RefreshCw
                size={13}
                style={{
                  color: isRefreshActive ? 'var(--vscode-button-foreground)' : 'var(--vscode-input-foreground)',
                  opacity: isRefreshActive ? 1 : 0.82,
                  animation: isRefreshActive ? 'gitcat-refresh-spin 0.7s ease-in-out' : 'none',
                  transition: 'color 0.18s ease'
                }}
              />
            </button >
            {isBranchListOpen ? (
              <ChevronUp size={14} style={{ color: 'var(--vscode-input-foreground)', opacity: 0.88 }} />
            ) : (
              <ChevronDown size={14} style={{ color: 'var(--vscode-input-foreground)', opacity: 0.88 }} />
            )}
          </div >
        </div >

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
            overflow: 'hidden',
          }}>
            {(isRefreshActive || isCheckoutPending) && (
              <span style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: isCheckoutPending ? 'var(--vscode-charts-orange)' : 'var(--vscode-charts-blue)',
                boxShadow: '0 0 0 2px rgba(111, 179, 224, 0.18)',
                flexShrink: 0,
              }} />
            )}
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isCheckoutPending ? `${t('git.switching')} (${checkoutingBranch})` : refreshStatusLabel}
            </span>
          </span>
          <span style={{ color: 'var(--vscode-descriptionForeground)', opacity: 0.82 }}>{t('git.manualRefresh')}</span>
        </div>
      </div>

      {/* ── Branch List Accordion Content ── */}
      < div
        style={{
          margin: isBranchListOpen ? '0 8px 12px 8px' : '0 8px 0 8px',
          border: '1px solid var(--vscode-panel-border)',
          borderTop: 'none',
          borderRadius: '0 0 4px 4px',
          overflowY: 'auto',
          background: 'var(--vscode-editor-background)',
          color: 'var(--vscode-editor-foreground)',
          maxHeight: isBranchListOpen ? '320px' : '0px',
          opacity: isBranchListOpen ? 1 : 0,
          transform: isBranchListOpen ? 'translateY(0)' : 'translateY(-6px)',
          transition: 'max-height 0.22s ease, opacity 0.18s ease, transform 0.22s ease, margin 0.22s ease',
        }}
      >
        {
          selectableBranches.length === 0 ? (
            <div style={{
              padding: '10px 12px',
              fontSize: '12px',
              color: 'var(--vscode-editor-foreground)',
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
                title={`이 브랜치로 전환: ${b.name}`}
                onClick={() => {
                  if (gitPanelBusy) return;
                  sendMessage('CHECKOUT_BRANCH', { name: b.name });
                  setCheckoutingBranch(b.name);
                  setIsBranchListOpen(false);
                }}
                style={{
                  padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer',
                  borderBottom: b === selectableBranches[selectableBranches.length - 1] ? 'none' : '1px solid var(--vscode-panel-border)',
                  background: isActive ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                  color: isActive ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-editor-foreground)',
                }}
                onMouseOver={e => { if (!isActive) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)' }}
                onMouseOut={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <GitBranch
                    size={12}
                    style={{
                      color: isActive
                        ? 'var(--vscode-list-activeSelectionForeground)'
                        : 'var(--vscode-descriptionForeground)',
                      opacity: isActive ? 0.9 : 1,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: '12px' }}>{b.name}</span>
                  {checkoutingBranch === b.name && (
                    <span style={{
                      fontSize: '10px',
                      color: isActive ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-descriptionForeground)',
                      marginLeft: '2px',
                      opacity: isActive ? 0.92 : 1,
                    }}>{t('git.switching')}</span>
                  )}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '10px',
                  color: isActive ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-descriptionForeground)',
                  opacity: isActive ? 0.88 : 1,
                }}>
                  <Clock size={10} /> {b.lastActivity?.split(' +')[0]}
                </div>
              </div>
            );
          })
        }
        <div style={{ borderTop: '1px solid var(--vscode-panel-border)', padding: '8px 10px' }}>
            <div style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.3px',
              color: 'var(--vscode-editor-foreground)',
              opacity: 0.75,
              marginBottom: '6px',
              textTransform: 'uppercase',
            }}>
              {t('git.worktrees', { count: displayWorktrees.length })}
            </div>
            {displayWorktrees.length === 0 ? (
              <div style={{
                fontSize: '11px',
                color: 'var(--vscode-editor-foreground)',
                opacity: 0.72,
                padding: '2px 0',
              }}>
                {t('git.worktrees.empty')}
              </div>
            ) : displayWorktrees.map((wt) => {
              const isCurrent = !!currentWorktreePath && wt.path === currentWorktreePath;
              return (
                <div
                  key={wt.path}
                  style={{
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: '3px',
                    padding: '6px 8px',
                    marginBottom: '6px',
                    background: isCurrent ? 'var(--vscode-list-activeSelectionBackground)' : 'var(--vscode-editor-background)',
                    color: isCurrent ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-editor-foreground)',
                  }}
                  title={`워크트리 경로: ${wt.path}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <GitBranch
                        size={11}
                        style={{
                          color: isCurrent
                            ? 'var(--vscode-list-activeSelectionForeground)'
                            : 'var(--vscode-descriptionForeground)',
                          opacity: isCurrent ? 0.92 : 1,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {wt.branch ?? t('git.detached')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                      {isCurrent && (
                        <span style={{
                          fontSize: '9px',
                          border: '1px solid var(--vscode-focusBorder)',
                          borderRadius: '999px',
                          padding: '1px 6px',
                          color: 'var(--vscode-list-activeSelectionForeground)',
                          opacity: 0.95,
                        }}>
                          {t('git.current')}
                        </span>
                      )}
                      {wt.isLocked && <Lock size={10} style={{ color: 'var(--vscode-descriptionForeground)' }} />}
                    </div>
                  </div>
                  <div style={{
                    marginTop: '4px',
                    fontSize: '10px',
                    color: isCurrent ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-descriptionForeground)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    opacity: isCurrent ? 0.82 : 0.9,
                  }}>
                    {compactPath(wt.path)}
                  </div>
                </div>
              );
            })}
          </div>
      </div >

      {/* ── New Branch Row ── */}
      {
        showNewBranch && !showCommitForm && (
          <div style={{ margin: '8px' }}>
            <div style={{
              fontSize: '12px', marginBottom: '6px',
              color: 'var(--vscode-descriptionForeground)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>{t('git.newBranch.title')}</span>
              <button
                type="button"
                title="입력·초안을 바탕으로 브랜치 이름을 AI가 추천합니다"
                onClick={() => {
                  clearBranchRecommendationError();
                  setShowBranchAI(true);
                }}
                disabled={isBranchRecommendationLoading}
                style={{
                  ...inlineBtn,
                  color: 'var(--vscode-button-foreground)',
                  background: 'var(--vscode-button-background)',
                  opacity: isBranchRecommendationLoading ? 0.7 : 1,
                  cursor: isBranchRecommendationLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {isBranchRecommendationLoading ? (
                  <>
                    <RotateCw size={11} style={{ animation: 'gitcat-refresh-spin 0.9s linear infinite' }} /> {t('git.ai.suggesting')}
                  </>
                ) : (
                  <>
                    <Sparkles size={11} /> {t('git.ai.suggest')}
                  </>
                )}
              </button>
            </div>
            {branchRecommendationError && (
              <div style={{
                marginBottom: '8px',
                color: 'var(--vscode-errorForeground)',
                fontSize: '11px',
                lineHeight: 1.4,
              }}>
                {branchRecommendationError}
              </div>
            )}
            <input
              autoFocus
              value={newBranchName}
              onChange={e => {
                const value = e.target.value;
                setNewBranchName(value);
                if (/\s/.test(value.trim())) {
                  setBranchNameError('브랜치명에는 공백을 사용할 수 없습니다. 공백 없이 다시 입력해 주세요.');
                } else {
                  setBranchNameError(null);
                }
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateBranch(); if (e.key === 'Escape') closeBranchForm(); }}
              placeholder={t('git.newBranch.placeholder')}
              maxLength={255}
              style={{
                width: '100%', boxSizing: 'border-box',
                fontSize: '12px', padding: '6px 8px',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: '3px', outline: 'none',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--vscode-focusBorder)')}
              onBlur={e => (e.target.style.borderColor = 'var(--vscode-panel-border)')}
            />
            {branchNameError && (
              <div style={{ marginTop: '6px', color: 'var(--vscode-errorForeground)', fontSize: '11px' }}>
                {branchNameError}
              </div>
            )}
            {aiBranchSuggestions.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: 'var(--vscode-descriptionForeground)',
                  marginBottom: '6px',
                }}>
                  추천 브랜치명 예시
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {aiBranchSuggestions.slice(1, 4).map((name, index) => (
                    <button
                      key={`${index}-${name}`}
                      type="button"
                      onClick={() => applyBranchCandidate(name)}
                      title={`이 이름을 입력란에 넣기: ${name}`}
                      style={{
                        fontSize: '11px',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--vscode-focusBorder)',
                        background: 'var(--vscode-editor-background)',
                        color: 'var(--vscode-editor-foreground)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  title="AI 추천 브랜치명 후보 목록을 접습니다"
                  onClick={clearBranchSuggestions}
                  style={{
                    marginTop: '6px',
                    border: 'none',
                    background: 'none',
                    color: 'var(--vscode-textLink-foreground)',
                    fontSize: '10px',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  후보 목록 닫기
                </button>
              </div>
            )}
          </div>
        )
      }

      {/* Create / Cancel buttons when new branch input is open */}
      {
        !showCommitForm && showNewBranch && (
          <div style={{ margin: '4px 8px', display: 'flex', gap: '8px' }}>
            <button type="button" title="입력한 이름으로 새 브랜치를 만듭니다" onClick={handleCreateBranch} style={btn('primary')}>
              <Check size={13} /> Create
            </button>
            <button type="button" title="새 브랜치 만들기 취소" onClick={closeBranchForm} style={btn('secondary')}>
              <X size={13} /> {t('git.newBranch.cancel')}
            </button>
          </div>
        )
      }

      {/* ── Commit message form ── */}
      {
        showCommitForm && (
          <div style={{ margin: '8px' }}>
            <div style={{
              fontSize: '12px', marginBottom: '6px',
              color: 'var(--vscode-descriptionForeground)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>Create Commit message</span>
              <button
                type="button"
                title="변경 내용·설명을 바탕으로 커밋 메시지를 AI가 추천합니다"
                onClick={() => {
                  clearCommitRecommendationError();
                  setShowBranchAI(true);
                }}
                disabled={isCommitRecommendationLoading}
                style={{
                  ...inlineBtn,
                  color: 'var(--vscode-button-foreground)',
                  background: 'var(--vscode-button-background)',
                  opacity: isCommitRecommendationLoading ? 0.7 : 1,
                  cursor: isCommitRecommendationLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {isCommitRecommendationLoading ? (
                  <>
                    <RotateCw size={11} style={{ animation: 'gitcat-refresh-spin 0.9s linear infinite' }} /> {t('git.ai.suggesting')}
                  </>
                ) : (
                  <>
                    <Sparkles size={11} /> {t('git.ai.suggest')}
                  </>
                )}
              </button>
            </div>
            {commitRecommendationError && (
              <div style={{
                marginBottom: '8px',
                color: 'var(--vscode-errorForeground)',
                fontSize: '11px',
                lineHeight: 1.4,
              }}>
                {commitRecommendationError}
              </div>
            )}
            <textarea
              autoFocus
              value={commitMessage}
              onChange={e => setCommitMessage(e.target.value)}
              placeholder="생성할 커밋명을 작성해주세요"
              maxLength={1000}
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
            {stagedCount === 0 && (
              <div style={{
                marginTop: '8px',
                fontSize: '11px',
                color: 'var(--vscode-descriptionForeground)',
                lineHeight: 1.4,
                opacity: 0.9,
              }}>
                커밋을 만들려면 먼저 변경 파일을 stage 해주세요. (Git Add)
              </div>
            )}
            {(aiCommitAlternatives.length > 0 || aiCommitSuggestedBranchNames.length > 0) && (
              <div style={{ marginTop: '8px' }}>
                {aiCommitAlternatives.length > 0 && (
                  <>
                    <div style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'var(--vscode-descriptionForeground)',
                      marginBottom: '6px',
                    }}>
                      추천 커밋명 예시
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                      {aiCommitAlternatives.slice(0, 3).map((msg, index) => (
                        <button
                          key={`${index}-${msg.slice(0, 20)}`}
                          type="button"
                          onClick={() => setCommitMessage(msg)}
                          title={msg}
                          style={{
                            fontSize: '11px',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--vscode-focusBorder)',
                            background: 'var(--vscode-editor-background)',
                            color: 'var(--vscode-editor-foreground)',
                            cursor: 'pointer',
                          }}
                        >
                          {msg.length > 48 ? `${msg.slice(0, 48)}...` : msg}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {aiCommitSuggestedBranchNames.length > 0 && (
                  <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>
                    참고 브랜치명: {aiCommitSuggestedBranchNames.join(', ')}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                title="스테이징된 변경을 입력한 메시지로 커밋합니다"
                onClick={handleCommit}
                disabled={isCommitting || !commitMessage.trim() || gitPanelBusy || stagedCount === 0}
                style={{
                  ...btn('primary'),
                  opacity: isCommitting || !commitMessage.trim() || gitPanelBusy || stagedCount === 0 ? 0.55 : 1,
                  cursor: isCommitting || !commitMessage.trim() || gitPanelBusy || stagedCount === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {isCommitting ? (
                  <>
                    <RotateCw size={13} style={{ animation: 'gitcat-refresh-spin 0.9s linear infinite' }} /> Committing...
                  </>
                ) : (
                  <>
                    <Check size={13} /> Create
                  </>
                )}
              </button>
              <button type="button" title="커밋 입력 취소" onClick={closeCommitForm} style={btn('secondary')}>
                <X size={13} /> {t('git.cancel')}
              </button>
            </div>
          </div>
        )
      }



      {/* ── 메인 버튼 그룹: 모두 동일한 flex 컨테이너에서 간격 통일 ── */}
      {
        !showNewBranch && !showCommitForm && !showMergeForm && (
          <div style={{ margin: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

            {/* New Branch (full-width, primary) */}
            <button
              type="button"
              title="새 브랜치 만들기 — 브랜치 이름 입력 후 생성"
              onClick={() => {
                if (!isGitConnected || gitPanelBusy) return;
                closeCommitForm();
                closeMergeForm();
                setShowNewBranch(true);
              }}
              disabled={!isGitConnected || gitPanelBusy}
              style={{
                ...bigBtn('primary'),
                opacity: isGitConnected && !gitPanelBusy ? 1 : 0.5,
                cursor: isGitConnected && !gitPanelBusy ? 'pointer' : 'not-allowed',
              }}
            >
              <GitBranch size={13} /> New Branch
            </button>

            {/* 2×2 그리드 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                title="워킹 트리의 변경 파일을 모두 스테이징합니다 (git add -A)"
                onClick={handleGitAdd}
                disabled={!isGitConnected || isStaging || gitPanelBusy}
                style={{
                  ...bigBtn('secondary'),
                  opacity: isGitConnected && !isStaging && !gitPanelBusy ? 1 : 0.5,
                  cursor: isGitConnected && !isStaging && !gitPanelBusy ? 'pointer' : 'not-allowed',
                }}
              >
                {isStaging ? (
                  <>
                    <RotateCw size={13} style={{ animation: 'gitcat-refresh-spin 0.9s linear infinite' }} /> Adding...
                  </>
                ) : (
                  <>
                    <Plus size={13} /> Git Add
                  </>
                )}
              </button>
              <button
                type="button"
                title="커밋 메시지를 입력하고 스테이징된 변경을 커밋합니다"
                onClick={() => {
                  if (!isGitConnected || gitPanelBusy) return;
                  closeBranchForm();
                  closeMergeForm();
                  setIsCommitGridPressed(true);
                  setShowCommitForm(true);
                }}
                disabled={!isGitConnected || gitPanelBusy}
                style={{ ...bigBtn('secondary'), opacity: isGitConnected && !gitPanelBusy ? 1 : 0.5, cursor: isGitConnected && !gitPanelBusy ? 'pointer' : 'not-allowed' }}
              >
                <Check
                  size={13}
                  style={{
                    animation: isCommitGridPressed ? 'gitcat-refresh-spin 0.7s ease-in-out' : 'none',
                  }}
                />{' '}
                Git Commit
              </button>
              <button
                type="button"
                title="현재 브랜치를 원격 저장소로 푸시합니다"
                onClick={handlePush}
                disabled={!isGitConnected || isPushing || gitPanelBusy}
                style={{
                  ...bigBtn('secondary'),
                  opacity: isGitConnected && !isPushing && !gitPanelBusy ? 1 : 0.5,
                  cursor: isGitConnected && !isPushing && !gitPanelBusy ? 'pointer' : 'not-allowed',
                }}
              >
                {isPushing ? (
                  <>
                    <RotateCw size={13} style={{ animation: 'gitcat-refresh-spin 0.9s linear infinite' }} /> {t('git.pushing')}
                  </>
                ) : (
                  <>
                    <ArrowUp size={13} /> {t('git.push')}
                  </>
                )}
              </button>
              <button
                type="button"
                title="GitCat 내에서 PR 생성하기"
                onClick={() => {
                  if (!isGitConnected || isOpeningPrPanel || gitPanelBusy) return;
                  closeCommitForm();
                  closeMergeForm();
                  closeBranchForm();
                  setIsOpeningPrPanel(true);
                  sendMessage('OPEN_PR_PANEL', {});
                }}
                disabled={!isGitConnected || isOpeningPrPanel || gitPanelBusy}
                style={{
                  ...bigBtn('secondary'),
                  opacity: isGitConnected && !isOpeningPrPanel && !gitPanelBusy ? 1 : 0.5,
                  cursor: isGitConnected && !isOpeningPrPanel && !gitPanelBusy ? 'pointer' : 'not-allowed',
                }}
              >
                {isOpeningPrPanel ? (
                  <>
                    <RotateCw size={13} style={{ animation: 'gitcat-refresh-spin 0.9s linear infinite' }} /> {t('git.pr.opening')}
                  </>
                ) : (
                  <>
                    <GitPullRequest size={13} /> {t('git.pr.create')}
                  </>
                )}
              </button>
            </div>

            {/* Pull / PR 생성 (2열, secondary) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                title="원격 저장소의 변경을 현재 브랜치로 가져옵니다 (git pull)"
                onClick={handlePull}
                disabled={!isGitConnected || isPulling || gitPanelBusy}
                style={{ ...bigBtn('secondary'), opacity: (isGitConnected && !isPulling && !gitPanelBusy) ? 1 : 0.5, cursor: (isGitConnected && !isPulling && !gitPanelBusy) ? 'pointer' : 'not-allowed' }}
              >
                <RotateCw size={13} style={{ animation: isPulling ? 'gitcat-refresh-spin 0.9s linear infinite' : 'none' }} />
                {isPulling ? t('git.pulling') : t('git.pull')}
              </button>
              <button
                type="button"
                title="선택한 소스 브랜치를 기준 브랜치에 병합합니다 (git merge)"
                onClick={() => {
                  if (!isGitConnected || gitPanelBusy) return;
                  mergePendingCloseRef.current = false;
                  mergeSawLoadingRef.current = false;
                  closeBranchForm();
                  closeCommitForm();
                  setMergeTarget(currentBranch);
                  setMergeSource('');
                  setIsMergeGridPressed(true);
                  setShowMergeForm(true);
                }}
                disabled={!isGitConnected || isMerging || gitPanelBusy}
                style={{
                  ...bigBtn('secondary'),
                  opacity: isGitConnected && !isMerging && !gitPanelBusy ? 1 : 0.5,
                  cursor: isGitConnected && !isMerging && !gitPanelBusy ? 'pointer' : 'not-allowed',
                }}
              >
                {isMerging ? (
                  <>
                    <RotateCw size={13} style={{ animation: 'gitcat-refresh-spin 0.9s linear infinite' }} /> {t('git.merging')}
                  </>
                ) : (
                  <>
                    <GitMerge
                      size={13}
                      style={{
                        animation: isMergeGridPressed ? 'gitcat-refresh-spin 0.7s ease-in-out' : 'none',
                      }}
                    />{' '}
                    {t('git.merge')}
                  </>
                )}
              </button>
            </div>

          </div>
        )
      }

      {/* ── No Git Guide (Empty State) ── */}
      {
        !isGitConnected && (
          <div style={{
            margin: '20px 12px', padding: '16px',
            borderRadius: '6px', border: '1px dashed var(--vscode-panel-border)',
            textAlign: 'center', background: 'rgba(255,255,255,0.02)'
          }}>
            <AlertCircle size={24} style={{ color: webviewDescriptionForeground, marginBottom: '10px', opacity: 0.55 }} />
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: webviewBodyForeground }}>
              {t('git.noRepository')}
            </div>
            <div style={{ fontSize: '11px', color: webviewDescriptionForeground, lineHeight: '1.5', opacity: 0.92 }}>
              .git 폴더가 포함된 프로젝트 폴더를<br />
              [File] &gt; [Open Folder...]로 열어주세요.
            </div>
          </div>
        )
      }

      {/* ── Merge 브랜치 선택 폼 ── */}
      {
        showMergeForm && (
          <div style={{ margin: '8px', color: webviewBodyForeground }}>
            <div style={{
              fontSize: '12px', marginBottom: '10px', fontWeight: 600,
              color: vscodeSidebarViewTitleForeground,
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <GitMerge size={14} style={{ color: 'var(--vscode-charts-blue)' }} />
              {t('git.merge.title')}
            </div>

            {/* 병합할 브랜치 (source: FROM) */}
            <div style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '11px', color: 'var(--vscode-sideBar-foreground)', opacity: 0.92, display: 'block', marginBottom: '4px' }}>
                병합할 브랜치 (이 브랜치를 가져옵니다)
              </label>
              <select
                value={mergeSource}
                onChange={e => setMergeSource(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  fontSize: '12px', padding: '6px 8px',
                  background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
                  color: 'var(--vscode-dropdown-foreground, var(--vscode-input-foreground))',
                  border: `1px solid ${mergeSource ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)'}`,
                  borderRadius: '3px', outline: 'none',
                }}
              >
                <option value="">브랜치를 선택하세요</option>
                {branches
                  .filter(b => !b.isRemote && b.name !== mergeTarget)
                  .map(b => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))
                }
              </select>
            </div>

            {/* 기준 브랜치 (target: INTO) */}
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '11px', color: 'var(--vscode-sideBar-foreground)', opacity: 0.92, display: 'block', marginBottom: '4px' }}>
                기준 브랜치 (여기에 합쳐집니다)
              </label>
              <select
                value={mergeTarget}
                onChange={e => setMergeTarget(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  fontSize: '12px', padding: '6px 8px',
                  background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
                  color: 'var(--vscode-dropdown-foreground, var(--vscode-input-foreground))',
                  border: '1px solid var(--vscode-panel-border)',
                  borderRadius: '3px', outline: 'none',
                }}
              >
                {branches
                  .filter(b => !b.isRemote && b.name !== mergeSource)
                  .map(b => (
                    <option key={b.name} value={b.name}>{b.name}{b.isCurrent ? ` (${t('git.current')})` : ''}</option>
                  ))
                }
              </select>
            </div>

            {/* Merge 방향 표시 */}
            {mergeSource && mergeTarget && (
              <div style={{
                marginBottom: '10px', padding: '6px 10px',
                background: 'var(--vscode-editor-background)',
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: '3px', fontSize: '11px',
                color: 'var(--vscode-editor-foreground)',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <GitBranch size={11} style={{ color: 'var(--vscode-editor-foreground)', opacity: 0.75, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, color: 'var(--vscode-charts-blue)' }}>{mergeSource}</span>
                <span style={{ opacity: 0.85 }}>→</span>
                <GitBranch size={11} style={{ color: 'var(--vscode-editor-foreground)', opacity: 0.75, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, color: 'var(--vscode-charts-green)' }}>{mergeTarget}</span>
              </div>
            )}

            {/* 확인/취소 버튼 */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                title="선택한 소스 브랜치를 기준 브랜치로 병합 실행"
                onClick={handleRunMerge}
                disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget || isMerging || gitPanelBusy}
                style={{
                  ...btn('primary'),
                  opacity: (!mergeSource || !mergeTarget || mergeSource === mergeTarget || isMerging || gitPanelBusy) ? 0.5 : 1,
                  cursor: (!mergeSource || !mergeTarget || mergeSource === mergeTarget || isMerging || gitPanelBusy) ? 'not-allowed' : 'pointer',
                }}
              >
                {isMerging ? (
                  <>
                    <RotateCw size={13} style={{ animation: 'gitcat-refresh-spin 0.9s linear infinite' }} /> {t('git.merging')}
                  </>
                ) : (
                  <>
                    <GitMerge size={13} /> {t('git.merge.run')}
                  </>
                )}
              </button>
              <button type="button" title="머지 취소" onClick={closeMergeForm} style={btn('secondary')}>
                <X size={13} /> {t('git.cancel')}
              </button>
            </div>
          </div>
        )
      }

      {showSectionBannersInline && (
        <SectionNotificationBanner
          notification={sectionNotifications.git}
          onDismiss={dismissGitNotification}
        />
      )}

      {/* ── AI Prompt Webview Panel ── */}
      {
        showBranchAI && (
          <div style={{
            margin: '12px 8px 8px 8px', padding: '12px',
            background: 'var(--vscode-editor-background)',
            color: 'var(--vscode-editor-foreground)',
            border: '1px solid var(--vscode-charts-purple)',
            boxShadow: '0 0 10px rgba(197, 134, 192, 0.1)',
            borderRadius: '4px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--vscode-charts-purple)', fontWeight: 600 }}>
                <Sparkles size={14} /> {t('git.ai.panelTitle')}
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
                type="button"
                title="입력한 내용으로 AI 추천 요청 (Enter와 동일)"
                onClick={handleAISubmit}
                disabled={isRecommendationLoading}
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
                  color: 'var(--vscode-button-foreground)',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: isRecommendationLoading ? 'not-allowed' : 'pointer',
                  opacity: isRecommendationLoading ? 0.65 : 1,
                }}
              >
                {isRecommendationLoading ? (
                  <>
                    <RotateCw size={13} style={{ animation: 'gitcat-refresh-spin 0.9s linear infinite' }} /> {t('git.ai.submitting')}
                  </>
                ) : (
                  <>
                    <CornerDownRight size={13} /> Enter
                  </>
                )}
              </button>
              <button
                type="button"
                title="AI 추천 패널 닫기"
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
                <X size={13} /> {t('git.ai.close')}
              </button>
            </div>
          </div>
        )
      }

      {/* ── Merge 결과 (충돌 시 파일 목록) ── */}
      {
        mergeResult && !mergeResult.success && (
          <div style={{
            margin: '8px',
            padding: '10px 12px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            borderRadius: '4px',
            border: `1px solid var(--vscode-inputValidation-errorBorder)`,
            background: 'var(--vscode-inputValidation-errorBackground)',
            color: 'var(--vscode-errorForeground)',
          }}>
            <AlertCircle size={14} style={{ color: 'var(--vscode-errorForeground)', flexShrink: 0, marginTop: '1px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: mergeResult.conflictedFiles?.length ? '6px' : 0, color: 'var(--vscode-errorForeground)' }}>
                병합 충돌이 발생했습니다.
              </div>
              {mergeResult.conflictedFiles && mergeResult.conflictedFiles.length > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--vscode-errorForeground)', opacity: 0.92 }}>
                  <div style={{ marginBottom: '5px' }}>충돌 파일 목록:</div>
                  {mergeResult.conflictedFiles.map((file) => (
                    <div
                      key={file}
                      onClick={() => sendMessage('OPEN_WORKSPACE_FILE', { filePath: file })}
                      onMouseOver={e => {
                        e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
                        e.currentTarget.style.color = 'var(--vscode-textLink-foreground)';
                        e.currentTarget.style.textDecoration = 'underline';
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.background = 'var(--vscode-editor-background)';
                        e.currentTarget.style.color = 'var(--vscode-editor-foreground)';
                        e.currentTarget.style.textDecoration = 'none';
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 8px',
                        background: 'var(--vscode-editor-background)',
                        borderRadius: '2px',
                        marginBottom: '3px',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: 'var(--vscode-editor-foreground)',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      title={`${file} 클릭하여 파일 열기`}
                    >
                      <ExternalLink size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
                      {file}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              title="병합 충돌 안내 닫기"
              onClick={clearMergeResult}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--vscode-errorForeground)', opacity: 0.7, flexShrink: 0 }}
            >
              <X size={12} />
            </button>
          </div>
        )
      }

    </div>
  );
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
