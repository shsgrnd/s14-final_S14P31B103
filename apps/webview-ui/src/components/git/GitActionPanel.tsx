import React, { useState, useEffect } from 'react';
import { GitBranch, Plus, ArrowUp, GitMerge, Check, Sparkles, ChevronDown, ChevronUp, X, CornerDownRight, Clock, RefreshCw, AlertCircle, Info, RotateCw, CheckCircle2, ExternalLink, GitPullRequest } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { btn, bigBtn, inlineBtn } from '../../shared/styles';

export const GitActionPanel: React.FC = () => {
  const { currentBranch, branches, globalNotification, clearGlobalNotification, isRefreshingStatus, lastStatusRefreshAt, mergeResult, clearMergeResult, prSuggestion, isPrLoading, clearPrSuggestion } = useGitCatStore();
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
  const [checkoutingBranch, setCheckoutingBranch] = useState<string | null>(null);
  const [showMergeForm, setShowMergeForm] = useState(false);
  // source: 병합할 브랜치(FROM), target: 기준 브랜치(INTO, 기본값: currentBranch)
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState(currentBranch);

  // 백엔드 globalNotification이 설정되면 5초 후 자동 소거
  useEffect(() => {
    if (!globalNotification) return;
    const timer = setTimeout(() => clearGlobalNotification(), 5000);
    return () => clearTimeout(timer);
  }, [globalNotification, clearGlobalNotification]);

  // 브랜치 체크아웃 완료 시 로딩 상태 해제
  useEffect(() => {
    setCheckoutingBranch(null);
  }, [currentBranch]);

  // AI 추천 결과 연동 (브랜치/커밋 등 필요 시 추가)
  // PR 추천 폼이 외부 탭으로 분리되면서 폼 자동 완성 로직 제거

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

  const closeMergeForm = () => {
    setShowMergeForm(false);
    setMergeSource('');
    setMergeTarget(currentBranch);
  };



  const handleGitAdd = () => {
    sendMessage('GIT_ADD_ALL', {});
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
      closeMergeForm();
      setShowCommitForm(true);
    }
  };

  const handlePush = () => {
    sendMessage('GIT_PUSH', {});
    showStatus('Git push가 완료되었습니다.', true);
  };

  const handleOpenPullRequestPanel = () => {
    if (!isGitConnected) return;

    closeCommitForm();
    closeMergeForm();
    closeBranchForm();

    sendMessage('OPEN_PR_PANEL', {});
  };

  const handleMerge = () => {
    // Merge 버튼 클릭 → 브랜치 선택 폼 표시
    closeBranchForm();
    closeCommitForm();
    setMergeTarget(currentBranch);
    setMergeSource('');
    setShowMergeForm(true);
  };

  const handleRunMerge = () => {
    if (!mergeSource || !mergeTarget) return;
    if (mergeSource === mergeTarget) {
      showStatus('같은 브랜치는 머지할 수 없습니다.', false);
      return;
    }
    sendMessage('RUN_MERGE', { source: mergeSource, target: mergeTarget });
    showStatus(`'${mergeSource}' → '${mergeTarget}' Merge 요청을 보냈습니다.`, true);
    closeMergeForm();
  };

  const refreshStatusLabel = isRefreshingStatus
    ? 'Refreshing Git status...'
    : lastStatusRefreshAt
      ? `Updated ${formatRefreshTime(lastStatusRefreshAt)}`
      : 'Not refreshed yet';

  const isRefreshActive = isRefreshingStatus || isRefreshPressed;
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

  const selectableBranches = branches.filter((branch) => branch.name !== currentBranch && !branch.isRemote);

  const handleAISubmit = () => {
    const prompt = aiPrompt.trim();
    if (!prompt) return;

    if (showCommitForm) {
      // RECOMMEND_COMMIT 스키마: { diffText: string, tag?: string }
      sendMessage('RECOMMEND_COMMIT', { diffText: prompt });
    } else {
      // RECOMMEND_BRANCH 스키마: { purpose: string }
      sendMessage('RECOMMEND_BRANCH', { purpose: prompt });
    }

    closeAIPrompt();
  };

  const aiPromptPlaceholder = showCommitForm
    ? '어떤 기능을 구현하셨나요? commit에 넣을 내용을 정리해서 입력해주세요.'
    : '어떤 기능을 구현하실 예정인가요? branch에 넣을 내용을 정리해서 입력해주세요.';

  const isGitConnected = currentBranch !== '';

  return (
    <div className="animate-fade-in" style={{ padding: '8px 4px' }}>
      {/* ── Branch Selector Accordion Header ── */}
      <div>
        <div
          onClick={() => setIsBranchListOpen(!isBranchListOpen)}
          style={{
            margin: isBranchListOpen ? '0 8px 0 8px' : '0 8px 0 8px',
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
            <GitBranch size={15} style={{ color: isGitConnected ? 'var(--vscode-charts-blue)' : 'var(--vscode-descriptionForeground)', flexShrink: 0 }} />
            <span style={{
              fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: isGitConnected ? 'inherit' : 'var(--vscode-descriptionForeground)'
            }}>
              {isGitConnected ? currentBranch : '저장소가 연결되지 않음'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              aria-label="Refresh Git status"
              title="Refresh Git status"
              onClick={handleRefreshStatus}
              disabled={isRefreshingStatus || !isGitConnected}
              style={iconBtnStyle(isRefreshActive)}
            >
              <RefreshCw
                size={13}
                style={{
                  color: isRefreshActive ? 'var(--vscode-button-foreground)' : 'var(--vscode-descriptionForeground)',
                  animation: isRefreshActive ? 'gitcat-refresh-spin 0.7s ease-in-out' : 'none',
                  transition: 'color 0.18s ease'
                }}
              />
            </button >
            {isBranchListOpen ? <ChevronUp size={14} style={{ color: 'var(--vscode-descriptionForeground)' }} /> : <ChevronDown size={14} style={{ color: 'var(--vscode-descriptionForeground)' }} />}
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
            {isRefreshActive && (
              <span style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: 'var(--vscode-charts-blue)',
                boxShadow: '0 0 0 2px rgba(111, 179, 224, 0.18)',
                flexShrink: 0,
              }} />
            )}
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {refreshStatusLabel}
            </span>
          </span>
          <span style={{ color: 'var(--vscode-descriptionForeground)', opacity: 0.82 }}>Auto every 20s</span>
        </div>
      </div >

      {/* ── Branch List Accordion Content ── */}
      < div
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
        {
          selectableBranches.length === 0 ? (
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
                onClick={() => {
                  sendMessage('CHECKOUT_BRANCH', { name: b.name });
                  setCheckoutingBranch(b.name);
                  setIsBranchListOpen(false);
                }}
                style={{
                  padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer',
                  borderBottom: b === selectableBranches[selectableBranches.length - 1] ? 'none' : '1px solid var(--vscode-panel-border)',
                  background: isActive ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                  color: isActive ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'
                }}
                onMouseOver={e => { if (!isActive) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)' }}
                onMouseOut={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <GitBranch size={12} style={{ color: 'var(--vscode-descriptionForeground)' }} />
                  <span style={{ fontSize: '12px' }}>{b.name}</span>
                  {checkoutingBranch === b.name && (
                    <span style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', marginLeft: '2px' }}>전환 중...</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>
                  <Clock size={10} /> {b.lastActivity?.split(' +')[0]}
                </div>
              </div>
            );
          })
        }
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
              maxLength={255}
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
      }

      {/* Create / Cancel buttons when new branch input is open */}
      {
        !showCommitForm && showNewBranch && (
          <div style={{ margin: '4px 8px', display: 'flex', gap: '8px' }}>
            <button onClick={handleCreateBranch} style={btn('primary')}>
              <Check size={13} /> Create
            </button>
            <button onClick={closeBranchForm} style={btn('secondary')}>
              <X size={13} /> Cancel
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
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={handleCommit} style={btn('primary')}>
                <Check size={13} /> Create
              </button>
              <button onClick={closeCommitForm} style={btn('secondary')}>
                <X size={13} /> Cancel
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
              onClick={() => {
                if (!isGitConnected) return;
                closeCommitForm();
                closeMergeForm();
                setShowNewBranch(true);
              }}
              disabled={!isGitConnected}
              style={{
                ...bigBtn('primary'),
                opacity: isGitConnected ? 1 : 0.5,
                cursor: isGitConnected ? 'pointer' : 'not-allowed',
              }}
            >
              <GitBranch size={13} /> New Branch
            </button>

            {/* 2×2 그리드 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                onClick={handleGitAdd}
                disabled={!isGitConnected}
                style={{ ...bigBtn('secondary'), opacity: isGitConnected ? 1 : 0.5, cursor: isGitConnected ? 'pointer' : 'not-allowed' }}
              >
                <Plus size={13} /> Git Add
              </button>
              <button
                onClick={() => isGitConnected && setShowCommitForm(true)}
                disabled={!isGitConnected}
                style={{ ...bigBtn('secondary'), opacity: isGitConnected ? 1 : 0.5, cursor: isGitConnected ? 'pointer' : 'not-allowed' }}
              >
                <Check size={13} /> Git Commit
              </button>
              <button
                onClick={handlePush}
                disabled={!isGitConnected}
                style={{ ...bigBtn('secondary'), opacity: isGitConnected ? 1 : 0.5, cursor: isGitConnected ? 'pointer' : 'not-allowed' }}
              >
                <ArrowUp size={13} /> Git Push
              </button>
              <button
                onClick={handleMerge}
                disabled={!isGitConnected}
                style={{ ...bigBtn('secondary'), opacity: isGitConnected ? 1 : 0.5, cursor: isGitConnected ? 'pointer' : 'not-allowed' }}
              >
                <GitMerge size={13} /> Merge
              </button>
            </div>

            {/* PR 생성 (full-width, primary — New Branch와 완전 동일한 스타일) */}
            <button
              onClick={handleOpenPullRequestPanel}
              disabled={!isGitConnected}
              style={{
                ...bigBtn('primary'),
                opacity: (!isGitConnected) ? 0.5 : 1,
                cursor: (!isGitConnected) ? 'not-allowed' : 'pointer',
              }}
              title="GitCat 내에서 PR 생성하기"
            >
              <GitPullRequest size={13} /> PR 생성
            </button>

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
            <AlertCircle size={24} style={{ color: 'var(--vscode-descriptionForeground)', marginBottom: '10px', opacity: 0.5 }} />
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--vscode-foreground)' }}>
              Git 저장소를 찾을 수 없습니다
            </div>
            <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', lineHeight: '1.5' }}>
              .git 폴더가 포함된 프로젝트 폴더를<br />
              [File] &gt; [Open Folder...]로 열어주세요.
            </div>
          </div>
        )
      }

      {/* ── Merge 브랜치 선택 폼 ── */}
      {
        showMergeForm && (
          <div style={{ margin: '8px' }}>
            <div style={{
              fontSize: '12px', marginBottom: '10px', fontWeight: 600,
              color: 'var(--vscode-foreground)',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <GitMerge size={14} style={{ color: 'var(--vscode-charts-blue)' }} />
              Merge 브랜치 선택
            </div>

            {/* 병합할 브랜치 (source: FROM) */}
            <div style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', display: 'block', marginBottom: '4px' }}>
                병합할 브랜치 (이 브랜치를 가져옵니다)
              </label>
              <select
                value={mergeSource}
                onChange={e => setMergeSource(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  fontSize: '12px', padding: '6px 8px',
                  background: 'var(--vscode-input-background)',
                  color: 'var(--vscode-input-foreground)',
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
              <label style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', display: 'block', marginBottom: '4px' }}>
                기준 브랜치 (여기에 합쳐집니다)
              </label>
              <select
                value={mergeTarget}
                onChange={e => setMergeTarget(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  fontSize: '12px', padding: '6px 8px',
                  background: 'var(--vscode-input-background)',
                  color: 'var(--vscode-input-foreground)',
                  border: '1px solid var(--vscode-panel-border)',
                  borderRadius: '3px', outline: 'none',
                }}
              >
                {branches
                  .filter(b => !b.isRemote && b.name !== mergeSource)
                  .map(b => (
                    <option key={b.name} value={b.name}>{b.name}{b.isCurrent ? ' (현재)' : ''}</option>
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
                color: 'var(--vscode-descriptionForeground)',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <GitBranch size={11} />
                <span style={{ fontWeight: 600, color: 'var(--vscode-charts-blue)' }}>{mergeSource}</span>
                <span>→</span>
                <GitBranch size={11} />
                <span style={{ fontWeight: 600, color: 'var(--vscode-charts-green)' }}>{mergeTarget}</span>
              </div>
            )}

            {/* 확인/취소 버튼 */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleRunMerge}
                disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget}
                style={{
                  ...btn('primary'),
                  opacity: (!mergeSource || !mergeTarget || mergeSource === mergeTarget) ? 0.5 : 1,
                  cursor: (!mergeSource || !mergeTarget || mergeSource === mergeTarget) ? 'not-allowed' : 'pointer',
                }}
              >
                <GitMerge size={13} /> Merge 실행
              </button>
              <button onClick={closeMergeForm} style={btn('secondary')}>
                <X size={13} /> 취소
              </button>
            </div>
          </div>
        )
      }

      {/* 백엔드 에러 / 알림 표시 (ERROR, NOTIFICATION, GIT_OPERATION_RESULT) */}
      {
        globalNotification && (
          <div style={{
            margin: '8px',
            padding: '8px 10px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            borderRadius: '3px',
            border: `1px solid ${globalNotification.type === 'error' ? 'var(--vscode-inputValidation-errorBorder)'
              : globalNotification.type === 'warning' ? 'var(--vscode-inputValidation-warningBorder)'
                : 'var(--vscode-focusBorder)'
              }`,
            background: `${globalNotification.type === 'error' ? 'var(--vscode-inputValidation-errorBackground)'
              : globalNotification.type === 'warning' ? 'var(--vscode-inputValidation-warningBackground)'
                : 'var(--vscode-inputValidation-infoBackground)'
              }`,
            color: `${globalNotification.type === 'error' ? 'var(--vscode-errorForeground)'
              : 'var(--vscode-foreground)'
              }`,
          }}>
            {globalNotification.type === 'error'
              ? <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
              : <Info size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
            }
            <span style={{ flex: 1, lineHeight: 1.4 }}>{globalNotification.message}</span>
            <button
              onClick={clearGlobalNotification}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: 'inherit', opacity: 0.7, flexShrink: 0 }}
            >
              <X size={12} />
            </button>
          </div>
        )
      }

      {/* Status feedback message */}
      {
        statusMsg && (
          <div style={{
            margin: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px',
            color: statusMsg.ok ? 'var(--vscode-charts-green)' : 'var(--vscode-errorForeground)',
          }}>
            <Check size={13} />
            {statusMsg.text}
          </div>
        )
      }

      {/* ── AI Prompt Webview Panel ── */}
      {
        showBranchAI && (
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
        )
      }

      {/* ── Merge 결과 배너 ── */}
      {
        mergeResult && (
          <div style={{
            margin: '8px',
            padding: '10px 12px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            borderRadius: '4px',
            border: `1px solid ${mergeResult.success
                ? 'var(--vscode-charts-green)'
                : 'var(--vscode-inputValidation-errorBorder)'
              }`,
            background: mergeResult.success
              ? 'rgba(78, 201, 176, 0.08)'
              : 'var(--vscode-inputValidation-errorBackground)',
          }}>
            {mergeResult.success ? (
              <CheckCircle2 size={14} style={{ color: 'var(--vscode-charts-green)', flexShrink: 0, marginTop: '1px' }} />
            ) : (
              <AlertCircle size={14} style={{ color: 'var(--vscode-errorForeground)', flexShrink: 0, marginTop: '1px' }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: mergeResult.conflictedFiles?.length ? '6px' : 0 }}>
                {mergeResult.success ? '병합이 완료되었습니다.' : '병합 충돌이 발생했습니다.'}
              </div>
              {!mergeResult.success && mergeResult.conflictedFiles && mergeResult.conflictedFiles.length > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
                  <div style={{ marginBottom: '5px' }}>충돌 파일 목록:</div>
                  {mergeResult.conflictedFiles.map((file) => (
                    <div
                      key={file}
                      onClick={() => sendMessage('OPEN_FILE' as any, { path: file })}
                      onMouseOver={e => {
                        e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
                        e.currentTarget.style.color = 'var(--vscode-textLink-foreground)';
                        e.currentTarget.style.textDecoration = 'underline';
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.background = 'var(--vscode-editor-background)';
                        e.currentTarget.style.color = 'inherit';
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
              onClick={clearMergeResult}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: 'inherit', opacity: 0.7, flexShrink: 0 }}
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
