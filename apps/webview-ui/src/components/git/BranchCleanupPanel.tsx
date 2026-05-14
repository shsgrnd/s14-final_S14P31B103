import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Trash2, Clock, GitBranch, AlertTriangle, Settings, ArrowLeft, Plus, X, ShieldCheck, Lock, Sliders, ChevronRight, Save, Check } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { BranchCleanupSettings, BranchCleanupCandidate } from '@gitcat/shared-types';
import { SectionNotificationBanner } from '../common/SectionNotificationBanner';

type BranchStatus = 'active' | 'merged' | 'stale' | 'protected';

const normalizeBranchName = (name: string): string =>
  name.replace(/^refs\/heads\//, '').replace(/^origin\//, '').trim();

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

const DEFAULT_CLEANUP_SETTINGS: BranchCleanupSettings = {
  enabled: true,
  olderThanValue: 1,
  olderThanUnit: 'month',
  deleteMergedBranches: true,
  deleteGoneRemoteBranches: false,
  protectedBranches: ['main', 'master'],
};

/**
 * 두 BranchCleanupSettings 가 동일한지 비교 (draft vs cleanupSettings 의 dirty 판정용).
 * protectedBranches 는 순서까지 동일해야 같다고 본다 — 추가/삭제는 항상 끝에 append 또는 filter 만 사용하므로 안전.
 */
function settingsEqual(a: BranchCleanupSettings, b: BranchCleanupSettings): boolean {
  if (a.enabled !== b.enabled) return false;
  if (a.olderThanValue !== b.olderThanValue) return false;
  if (a.olderThanUnit !== b.olderThanUnit) return false;
  if (a.deleteMergedBranches !== b.deleteMergedBranches) return false;
  if (a.deleteGoneRemoteBranches !== b.deleteGoneRemoteBranches) return false;
  if (a.protectedBranches.length !== b.protectedBranches.length) return false;
  for (let i = 0; i < a.protectedBranches.length; i++) {
    if (a.protectedBranches[i] !== b.protectedBranches[i]) return false;
  }
  return true;
}

export const BranchCleanupPanel: React.FC = () => {
  const {
    branches: allBranches,
    currentBranch,
    cleanupSettings,
    cleanupPreview,
    cleanupExecuteResult,
    sectionNotifications,
    clearSectionNotification,
  } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();
  const dismissCleanupNotification = useCallback(() => clearSectionNotification('branchCleanup'), [clearSectionNotification]);

  const isGitConnected = currentBranch !== '';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [isSettingMode, setIsSettingMode] = useState(false);
  const [newProtectedBranch, setNewProtectedBranch] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false); // 삭제 확인 모달 상태
  /**
   * 자동 정리 구성 화면의 임시(draft) 상태.
   * - 외부 cleanupSettings 와 분리되어, 사용자가 [저장] 버튼을 누를 때만 백엔드로 반영된다.
   * - 설정 모드 진입/외부 cleanupSettings 갱신 시 동기화한다.
   */
  const [draftSettings, setDraftSettings] = useState<BranchCleanupSettings | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // “추천 자동 선택”은 최초 1회만(사용자 조작 후에는 절대 강제 선택하지 않음)
  const autoSelectArmedRef = useRef(true);

  const normalizedCurrentBranch = normalizeBranchName(currentBranch);

  const effectiveStatusFromCandidate = (c: BranchCleanupCandidate): BranchStatus => {
    if (c.isCurrent) return 'active';
    if (c.isProtected) return 'protected';
    if (c.isMerged) return 'merged';
    return 'stale';
  };

  const effectiveBranches = (cleanupPreview?.candidates ?? []).map((c) => ({
    name: c.branchName,
    lastActivity: c.lastCommitDate,
    effectiveStatus: effectiveStatusFromCandidate(c),
    shouldDelete: c.shouldDelete,
  }));

  const deletableBranches = effectiveBranches.filter((b) =>
    b.shouldDelete
  );
  const manualSelectableBranches = effectiveBranches.filter((b) =>
    b.effectiveStatus !== 'active' && b.effectiveStatus !== 'protected'
  );
  const selectedManualCount = manualSelectableBranches.filter(b => selected.has(b.name)).length;
  const allSelected = manualSelectableBranches.length > 0 && manualSelectableBranches.every(b => selected.has(b.name));

  // [Dry-run] 브랜치 목록이나 설정이 변경되면 삭제 권장 브랜치 자동 선택
  React.useEffect(() => {
    if (effectiveBranches.length === 0) {
      setSelected(new Set());
      autoSelectArmedRef.current = true;
      return;
    }

    const recommended = deletableBranches
      .filter((b) => normalizeBranchName(b.name) !== normalizedCurrentBranch)
      .map(b => b.name);

    // 현재 선택된 것 중 목록에 없는 것들은 제거하고, 새로운 추천 목록을 병합
    setSelected(prev => {
      const next = new Set<string>();
      // 1. 기존 선택된 것 중 현재 유효한 브랜치만 유지
      prev.forEach(name => {
        const branch = effectiveBranches.find(b => b.name === name);
        if (!branch) return;
        if (branch.effectiveStatus === 'active' || normalizeBranchName(branch.name) === normalizedCurrentBranch) return;
        next.add(name);
      });
      // 2. 최초 진입 1회만 추천 목록 자동 선택 (사용자가 비우면 그대로 둠)
      if (next.size === 0 && autoSelectArmedRef.current) {
        recommended.forEach(name => next.add(name));
        autoSelectArmedRef.current = false;
      }
      return next;
    });
  }, [effectiveBranches, deletableBranches]);

  // 설정 모드 진입 시 외부 cleanupSettings 를 draft 로 복사 (이후엔 저장 전까지 분리 유지)
  useEffect(() => {
    if (isSettingMode && cleanupSettings && !draftSettings) {
      setDraftSettings(cleanupSettings);
    }
    if (!isSettingMode) {
      setDraftSettings(null);
      setJustSaved(false);
      if (justSavedTimerRef.current) {
        clearTimeout(justSavedTimerRef.current);
        justSavedTimerRef.current = null;
      }
    }
  }, [isSettingMode, cleanupSettings, draftSettings]);

  // 외부 cleanupSettings 가 저장 echo 로 갱신되면, draft 가 clean 한 경우에만 동기화
  useEffect(() => {
    if (!isSettingMode || !cleanupSettings) return;
    setDraftSettings((current) => {
      if (!current) return cleanupSettings;
      const isClean = settingsEqual(current, cleanupSettings);
      return isClean ? cleanupSettings : current;
    });
  }, [cleanupSettings, isSettingMode]);

  useEffect(() => {
    return () => {
      if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
    };
  }, []);

  // 컴포넌트 마운트/연결 시 설정과 후보를 함께 불러오기
  React.useEffect(() => {
    if (isGitConnected) {
      sendMessage('GET_BRANCH_CLEANUP_SETTINGS', {});
      sendMessage('GET_BRANCH_CLEANUP_CANDIDATES', {});
    }
  }, [isGitConnected, sendMessage]);

  // 브랜치 목록이 갱신되면 후보도 재계산 요청 (삭제/체크아웃 후 최신화)
  React.useEffect(() => {
    if (!isGitConnected) return;
    sendMessage('GET_BRANCH_CLEANUP_CANDIDATES', {});
  }, [isGitConnected, allBranches, sendMessage]);

  // 설정이 바뀌면 후보도 재조회
  React.useEffect(() => {
    if (!isGitConnected || !cleanupSettings) return;
    sendMessage('GET_BRANCH_CLEANUP_CANDIDATES', {});
  }, [isGitConnected, cleanupSettings, sendMessage]);

  // 실행 결과 수신 후 후보를 한 번 더 동기화
  React.useEffect(() => {
    if (!isGitConnected || !cleanupExecuteResult) return;
    sendMessage('GET_BRANCH_CLEANUP_CANDIDATES', {});
  }, [isGitConnected, cleanupExecuteResult, sendMessage]);

  const showWarning = (msg: string) => {
    setWarningMsg(msg);
    setTimeout(() => setWarningMsg(null), 3500);
  };

  const toggleAll = () => {
    if (manualSelectableBranches.length === 0) return;
    autoSelectArmedRef.current = false;
    if (allSelected) {
      const next = new Set(selected);
      manualSelectableBranches.forEach(b => next.delete(b.name));
      setSelected(next);
    } else {
      const next = new Set(selected);
      manualSelectableBranches.forEach(b => next.add(b.name));
      setSelected(next);
    }
  };

  const toggleOne = (name: string, status: string) => {
    autoSelectArmedRef.current = false;
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

  const handleDeleteClick = () => {
    if (selected.size === 0) return;
    setShowConfirmModal(true);
  };

  const confirmDelete = () => {
    autoSelectArmedRef.current = false;
    sendMessage('EXECUTE_BRANCH_CLEANUP', { branchNames: Array.from(selected) });
    setSelected(new Set());
    setShowConfirmModal(false);
  };

  /**
   * draftSettings 를 부분 업데이트만 한다. 백엔드로는 전송되지 않으며,
   * 사용자가 명시적으로 [저장] 버튼을 눌렀을 때 commitDraftSettings 로 전송된다.
   */
  const updateDraft = (newSettings: Partial<BranchCleanupSettings>) => {
    setDraftSettings((prev) => {
      const base = prev ?? cleanupSettings;
      if (!base) return prev;
      return { ...base, ...newSettings };
    });
  };

  /**
   * [저장] 버튼 클릭. draftSettings 를 SAVE_BRANCH_CLEANUP_SETTINGS 로 전송.
   * - 저장 후 잠시 동안 버튼에 "저장됨" 피드백을 표시한다(2초).
   */
  const commitDraftSettings = () => {
    if (!draftSettings) {
      showWarning('설정을 아직 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    sendMessage('SAVE_BRANCH_CLEANUP_SETTINGS', { settings: draftSettings });
    setJustSaved(true);
    if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
    justSavedTimerRef.current = setTimeout(() => setJustSaved(false), 2000);
  };

  // 보호 브랜치 추가 (draft 에만 반영, 저장은 별도 버튼)
  const addProtectedBranch = () => {
    if (!newProtectedBranch.trim() || !draftSettings) return;
    if (draftSettings.protectedBranches.includes(newProtectedBranch.trim())) {
      showWarning('이미 보호 목록에 있는 브랜치입니다.');
      return;
    }
    const updated = [...draftSettings.protectedBranches, newProtectedBranch.trim()];
    updateDraft({ protectedBranches: updated });
    setNewProtectedBranch('');
  };

  // 보호 브랜치 삭제 (master, main 제외; draft 에만 반영)
  const removeProtectedBranch = (name: string) => {
    if (!draftSettings || ['master', 'main'].includes(name)) return;
    const updated = draftSettings.protectedBranches.filter(b => b !== name);
    updateDraft({ protectedBranches: updated });
  };

  const isDirty = Boolean(draftSettings && cleanupSettings && !settingsEqual(draftSettings, cleanupSettings));



  return (
    <div className="animate-fade-in" style={{ padding: '0 0 12px 0', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/*
        내부 헤더는 외곽 SectionHeader("Branch Cleanup")와 톤을 맞춘 슬림 툴바.
        - List 모드: 좌측에 GitBranch 아이콘 + 라벨, 우측에 설정 아이콘
        - Setting 모드: 좌측에 BackArrow + 라벨(자동 정리 구성)
        - 폰트: 11px/700 uppercase letterSpacing 0.04em — 다른 패널의 서브 라벨 톤과 동일
      */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px',
        background: 'transparent',
        borderBottom: '1px solid var(--vscode-panel-border)',
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          {isSettingMode ? (
            <button
              onClick={() => setIsSettingMode(false)}
              className="gitcat-icon-press"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                width: '26px', height: '26px', borderRadius: '4px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--vscode-foreground)',
                flexShrink: 0,
              }}
              aria-label="브랜치 정리 목록으로 돌아가기"
              title="돌아가기"
            >
              <ArrowLeft size={16} />
            </button>
          ) : (
            <GitBranch size={14} style={{ color: 'var(--vscode-descriptionForeground)', flexShrink: 0 }} />
          )}
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--vscode-foreground)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            minWidth: 0,
          }}>
            {isSettingMode ? '자동 정리 구성' : '브랜치 정리'}
          </span>
        </div>
        {!isSettingMode && (
          <button
            onClick={() => setIsSettingMode(true)}
            className="gitcat-icon-press"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              width: '26px', height: '26px', borderRadius: '4px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--vscode-descriptionForeground)',
              flexShrink: 0,
            }}
            title="자동 정리 환경 설정"
            aria-label="자동 정리 환경 설정"
          >
            <Settings size={16} />
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        <SectionNotificationBanner
          notification={sectionNotifications.branchCleanup}
          onDismiss={dismissCleanupNotification}
        />
        {!isGitConnected ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ marginBottom: '12px', color: 'var(--vscode-descriptionForeground)', opacity: 0.5 }}>
              <ShieldCheck size={32} strokeWidth={1} style={{ margin: '0 auto' }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', lineHeight: '1.6' }}>
              Git 저장소 정보가 없습니다.<br/>워크스페이스를 확인해주세요.
            </div>
          </div>
        ) : (
          <>
            {isSettingMode ? (
              <div style={{ padding: '4px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {!draftSettings ? (
                  <div style={{
                    padding: '18px 12px',
                    fontSize: '12px',
                    color: 'var(--vscode-descriptionForeground)',
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: '6px',
                    textAlign: 'center',
                  }}>
                    설정을 불러오는 중입니다...
                    <div style={{ marginTop: '10px' }}>
                      <button
                        onClick={() => sendMessage('GET_BRANCH_CLEANUP_SETTINGS', {})}
                        style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--vscode-panel-border)',
                          background: 'var(--vscode-input-background)',
                          color: 'var(--vscode-foreground)',
                          cursor: 'pointer',
                        }}
                      >
                        다시 불러오기
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <section style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{
                        padding: '6px 10px',
                        borderBottom: '1px solid var(--vscode-panel-border)',
                        background: 'var(--vscode-sideBarSectionHeader-background)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Sliders size={12} style={{ color: 'var(--vscode-descriptionForeground)' }} />
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            color: 'var(--vscode-foreground)',
                          }}>정리 기준</span>
                        </div>
                      </div>

                      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <label style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          fontSize: '12px', cursor: 'pointer', minWidth: 0,
                        }}>
                          <input
                            type="checkbox"
                            checked={draftSettings.enabled}
                            onChange={(e) => updateDraft({ enabled: e.target.checked })}
                            style={{ flexShrink: 0 }}
                          />
                          <span style={{
                            flex: 1, minWidth: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            자동 정리 기능 사용
                          </span>
                        </label>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                          <span style={{
                            fontSize: '12px',
                            color: 'var(--vscode-descriptionForeground)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }} title="미활동 기준">미활동 기준</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <input
                              type="number"
                              min="1"
                              value={draftSettings.olderThanValue}
                              onChange={(e) => updateDraft({ olderThanValue: parseInt(e.target.value, 10) || 1 })}
                              style={{
                                width: '64px', padding: '6px', fontSize: '12px', textAlign: 'center',
                                background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
                                border: '1px solid var(--vscode-panel-border)', borderRadius: '4px', outline: 'none',
                                flexShrink: 0,
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                              <select
                                value={draftSettings.olderThanUnit}
                                onChange={(e) => updateDraft({ olderThanUnit: e.target.value as BranchCleanupSettings['olderThanUnit'] })}
                                style={{
                                  width: '100%', padding: '6px 26px 6px 8px', fontSize: '12px',
                                  background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
                                  border: '1px solid var(--vscode-panel-border)', borderRadius: '4px', outline: 'none',
                                  appearance: 'none', cursor: 'pointer'
                                }}
                              >
                                <option value="week">주</option>
                                <option value="month">개월</option>
                              </select>
                              <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.6 }}>
                                <ChevronRight size={12} style={{ transform: 'rotate(90deg)' }} />
                              </div>
                            </div>
                          </div>
                        </div>

                        <label style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          fontSize: '12px', cursor: 'pointer', minWidth: 0,
                        }}>
                          <input
                            type="checkbox"
                            checked={draftSettings.deleteMergedBranches}
                            onChange={(e) => updateDraft({ deleteMergedBranches: e.target.checked })}
                            style={{ flexShrink: 0 }}
                          />
                          <span
                            style={{
                              flex: 1, minWidth: 0,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                            title="병합된 브랜치만 정리 대상에 포함"
                          >
                            병합된 브랜치만 정리 대상에 포함
                          </span>
                        </label>
                      </div>
                    </section>

                    <section style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{
                        padding: '6px 10px',
                        borderBottom: '1px solid var(--vscode-panel-border)',
                        background: 'var(--vscode-sideBarSectionHeader-background)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ShieldCheck size={12} style={{ color: 'var(--vscode-descriptionForeground)' }} />
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            color: 'var(--vscode-foreground)',
                          }}>보호 브랜치</span>
                        </div>
                      </div>

                      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {draftSettings.protectedBranches.map(name => {
                            const isSystem = ['master', 'main'].includes(name);
                            return (
                              <div
                                key={name}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '5px',
                                  padding: '4px 8px', borderRadius: '4px',
                                  border: '1px solid var(--vscode-panel-border)',
                                  background: 'var(--vscode-editor-background)',
                                  fontSize: '11px',
                                  maxWidth: '100%', minWidth: 0,
                                  color: isSystem ? 'var(--vscode-descriptionForeground)' : 'var(--vscode-foreground)',
                                }}
                                title={name}
                              >
                                {isSystem ? <Lock size={10} style={{ flexShrink: 0 }} /> : <ShieldCheck size={10} style={{ flexShrink: 0 }} />}
                                <span style={{
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: '120px',
                                }}>
                                  {name}
                                </span>
                                {!isSystem && (
                                  <button
                                    onClick={() => removeProtectedBranch(name)}
                                    aria-label={`${name} 보호 해제`}
                                    style={{
                                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                      display: 'flex', color: 'var(--vscode-descriptionForeground)',
                                      flexShrink: 0,
                                    }}
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            placeholder="브랜치명 입력"
                            value={newProtectedBranch}
                            onChange={(e) => setNewProtectedBranch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addProtectedBranch()}
                            style={{
                              flex: 1, minWidth: 0, padding: '7px 8px', fontSize: '12px',
                              background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
                              border: '1px solid var(--vscode-panel-border)', borderRadius: '4px', outline: 'none'
                            }}
                          />
                          <button
                            onClick={addProtectedBranch}
                            className="gitcat-icon-press"
                            style={{
                              minWidth: '32px', padding: '0 10px',
                              background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)',
                              border: 'none', borderRadius: '4px', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}
                            title="보호 브랜치 추가"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </section>

                    {/* ── Save Action Bar ── */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      paddingTop: '4px',
                    }}>
                      <button
                        onClick={() => updateDraft(DEFAULT_CLEANUP_SETTINGS)}
                        className="gitcat-icon-press"
                        style={{
                          fontSize: '11px',
                          padding: '6px 10px',
                          borderRadius: '4px',
                          border: '1px solid var(--vscode-panel-border)',
                          background: 'var(--vscode-input-background)',
                          color: 'var(--vscode-descriptionForeground)',
                          cursor: 'pointer',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                        title="모든 설정을 기본값으로 되돌립니다 (저장 버튼을 눌러야 반영)"
                      >
                        기본값으로 복원
                      </button>
                      <button
                        onClick={commitDraftSettings}
                        disabled={!isDirty && !justSaved}
                        className="gitcat-icon-press"
                        style={{
                          flex: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '7px 10px',
                          borderRadius: '4px',
                          border: 'none',
                          background: justSaved
                            ? 'rgba(78, 201, 176, 0.2)'
                            : isDirty
                              ? 'var(--vscode-button-background)'
                              : 'var(--vscode-button-secondaryBackground)',
                          color: justSaved
                            ? '#4ec9b0'
                            : isDirty
                              ? 'var(--vscode-button-foreground)'
                              : 'var(--vscode-button-secondaryForeground)',
                          cursor: (!isDirty && !justSaved) ? 'default' : 'pointer',
                          opacity: (!isDirty && !justSaved) ? 0.55 : 1,
                          whiteSpace: 'nowrap',
                        }}
                        title={
                          justSaved
                            ? '저장되었습니다'
                            : isDirty
                              ? '변경된 설정을 저장합니다'
                              : '변경된 내용이 없습니다'
                        }
                        aria-label="자동 정리 설정 저장"
                      >
                        {justSaved ? <Check size={14} /> : <Save size={14} />}
                        {justSaved ? '저장됨' : isDirty ? '변경사항 저장' : '저장'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ padding: '4px 0' }}>
                {/* ── Select All Row ── */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '6px 12px', cursor: manualSelectableBranches.length > 0 ? 'pointer' : 'not-allowed',
                    opacity: manualSelectableBranches.length > 0 ? 1 : 0.6,
                    marginBottom: '2px',
                  }}
                  onClick={toggleAll}
                >
                  <div style={{
                    width: '14px', height: '14px', borderRadius: '3px', border: '1.5px solid var(--vscode-panel-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: allSelected ? '#4ec9b0' : 'transparent',
                    borderColor: allSelected ? '#4ec9b0' : 'var(--vscode-panel-border)',
                    transition: 'all 0.15s',
                    flexShrink: 0,
                  }}>
                    {allSelected && <ShieldCheck size={10} color="#fff" />}
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: 'var(--vscode-foreground)',
                  }}>
                    선택 가능 브랜치 ({selectedManualCount}/{manualSelectableBranches.length})
                  </span>
                </div>

                {/* ── Branch List ── */}
                <div style={{ marginTop: '2px' }}>
                  {effectiveBranches.map((branch) => {
                    const status = branch.effectiveStatus;
                    const isChecked = selected.has(branch.name);
                    const isUnclickable = status === 'active' || status === 'protected';

                    return (
                      <div
                        key={branch.name}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '10px 16px',
                          cursor: isUnclickable ? 'default' : 'pointer',
                          background: isChecked ? 'rgba(78, 201, 176, 0.08)' : 'transparent',
                          transition: 'background 0.2s',
                          borderLeft: isChecked ? '2px solid #4ec9b0' : '2px solid transparent'
                        }}
                        onMouseOver={e => { if (!isChecked && !isUnclickable) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'; }}
                        onMouseOut={e => { if (!isChecked && !isUnclickable) e.currentTarget.style.background = 'transparent'; }}
                        onClick={() => toggleOne(branch.name, status)}
                      >
                        <div style={{
                          width: '16px', height: '16px', borderRadius: '4px', border: '1.5px solid var(--vscode-panel-border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isChecked ? 'var(--vscode-button-background)' : 'transparent',
                          borderColor: isChecked ? 'var(--vscode-button-background)' : 'var(--vscode-panel-border)',
                          opacity: isUnclickable ? 0.3 : 1,
                          transition: 'all 0.2s'
                        }}>
                          {isChecked && <ShieldCheck size={12} color="var(--vscode-button-foreground)" />}
                        </div>
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: isChecked ? 600 : 400, color: 'var(--vscode-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {branch.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)', marginTop: '3px', opacity: 0.7 }}>
                            <Clock size={10} />
                            {branch.lastActivity}
                          </div>
                        </div>

                        <span style={{
                          fontSize: '10px', fontWeight: 700, padding: '3px 10px',
                          borderRadius: '4px', flexShrink: 0,
                          color: STATUS_COLOR[status],
                          background: STATUS_BG[status],
                          border: `1px solid ${STATUS_COLOR[status]}22`
                        }}>
                          {STATUS_LABEL[status]}
                        </span>
                        {branch.shouldDelete && (
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            flexShrink: 0,
                            color: '#4ec9b0',
                            background: 'rgba(78, 201, 176, 0.12)',
                            border: '1px solid rgba(78, 201, 176, 0.35)',
                          }}>
                            자동 추천
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Warning Message ── */}
                {warningMsg && (
                  <div style={{
                    margin: '16px', padding: '10px 12px', fontSize: '11px',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    color: 'var(--vscode-errorForeground)', background: 'rgba(241, 76, 76, 0.08)',
                    border: '1px solid var(--vscode-inputValidation-errorBorder)', borderRadius: '6px',
                  }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, lineHeight: 1.4 }}>{warningMsg}</span>
                  </div>
                )}

                {/* ── Delete Action Button ── */}
                {selected.size > 0 && (
                  <div style={{ padding: '16px 16px 8px 16px' }}>
                    <button
                      onClick={handleDeleteClick}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        width: '100%', height: '32px',
                        background: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)', border: 'none', borderRadius: '6px',
                        cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}
                      onMouseOver={e => e.currentTarget.style.opacity = '0.9'}
                      onMouseOut={e => e.currentTarget.style.opacity = '1'}
                    >
                      <Trash2 size={14} />
                      선택된 {selected.size}개 브랜치 정리 실행
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Confirmation Modal Overlay ── */}
      {showConfirmModal && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, padding: '20px'
        }}>
          <div style={{
            width: '100%', background: 'var(--vscode-editor-background)',
            borderRadius: '12px', border: '1px solid var(--vscode-panel-border)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            animation: 'modal-pop 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--vscode-panel-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--vscode-errorForeground)', marginBottom: '4px' }}>
                <AlertTriangle size={18} />
                <span style={{ fontWeight: 700, fontSize: '14px' }}>브랜치 삭제 확인</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', margin: 0 }}>
                다음 {selected.size}개의 브랜치를 영구적으로 삭제할까요?
              </p>
            </div>

            <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '12px 16px', background: 'var(--vscode-list-hoverBackground)', opacity: 0.8 }}>
              {Array.from(selected).map(name => (
                <div key={name} style={{ fontSize: '12px', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <GitBranch size={12} opacity={0.5} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 16px', display: 'flex', gap: '8px', background: 'var(--vscode-editor-background)' }}>
              <button 
                onClick={() => setShowConfirmModal(false)}
                style={{
                  flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--vscode-panel-border)',
                  background: 'transparent', color: 'var(--vscode-foreground)', cursor: 'pointer', fontSize: '12px'
                }}
              >
                취소
              </button>
              <button 
                onClick={confirmDelete}
                style={{
                  flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
                  background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', 
                  cursor: 'pointer', fontSize: '12px', fontWeight: 600
                }}
              >
                삭제 실행
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes modal-pop {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

