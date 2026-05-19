import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Trash2,
  Clock,
  GitBranch,
  AlertTriangle,
  Settings,
  ArrowLeft,
  Plus,
  X,
  ShieldCheck,
  Lock,
  Sliders,
  ChevronRight,
  Save,
  Check,
} from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { BranchCleanupSettings, BranchCleanupCandidate } from '@gitcat/shared-types';
import { SectionNotificationBanner } from '../common/SectionNotificationBanner';
import { useSidebarSectionNotificationMode } from '../../app/SidebarSectionNotificationContext';
import { vscodeSidebarViewTitleForeground, webviewBodyForeground, webviewDescriptionForeground } from '../../shared/styles';
import { t } from '../../i18n';

type BranchStatus = 'active' | 'merged' | 'stale' | 'protected';

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

function settingsEqual(a: BranchCleanupSettings, b: BranchCleanupSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeBranchName(name: string): string {
  return name.replace(/^refs\/heads\//, '').replace(/^origin\//, '').trim();
}

function getBranchStatus(candidate: BranchCleanupCandidate): BranchStatus {
  if (candidate.isCurrent) return 'active';
  if (candidate.isProtected) return 'protected';
  if (candidate.isMerged) return 'merged';
  return 'stale';
}

export const BranchCleanupPanel: React.FC = () => {
  const {
    currentBranch,
    cleanupSettings,
    cleanupPreview,
    cleanupExecuteResult,
    sectionNotifications,
    clearSectionNotification,
    setBranchCleanupInSettingsMode,
  } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();
  const dismissCleanupNotification = useCallback(() => clearSectionNotification('branchCleanup'), [clearSectionNotification]);
  const { showSectionBannersInline } = useSidebarSectionNotificationMode();

  const isGitConnected = currentBranch !== '';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [isSettingMode, setIsSettingMode] = useState(false);
  const [draftSettings, setDraftSettings] = useState<BranchCleanupSettings | null>(null);
  const [newProtectedBranch, setNewProtectedBranch] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimerRef = useRef<number | null>(null);
  const autoSelectArmedRef = useRef(true);

  useEffect(() => {
    setBranchCleanupInSettingsMode(isSettingMode);
    return () => setBranchCleanupInSettingsMode(false);
  }, [isSettingMode, setBranchCleanupInSettingsMode]);

  useEffect(() => {
    if (!isGitConnected) return;
    sendMessage('GET_BRANCH_CLEANUP_SETTINGS', {});
    sendMessage('GET_BRANCH_CLEANUP_CANDIDATES', {});
  }, [isGitConnected, sendMessage]);

  useEffect(() => {
    if (!isGitConnected) return;
    sendMessage('GET_BRANCH_CLEANUP_CANDIDATES', {});
  }, [isGitConnected, cleanupSettings, cleanupExecuteResult, sendMessage]);

  useEffect(() => {
    if (isSettingMode && cleanupSettings && !draftSettings) {
      setDraftSettings(cleanupSettings);
    }
    if (!isSettingMode) {
      setDraftSettings(null);
    }
  }, [isSettingMode, cleanupSettings, draftSettings]);

  useEffect(() => {
    return () => {
      if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
    };
  }, []);

  const branches = useMemo(() => {
    return (cleanupPreview?.candidates ?? []).map((candidate) => ({
      name: candidate.branchName,
      lastActivity: candidate.lastCommitDate,
      status: getBranchStatus(candidate),
      shouldDelete: candidate.shouldDelete,
    }));
  }, [cleanupPreview]);

  const selectableBranches = useMemo(
    () => branches.filter((branch) => branch.status !== 'active' && branch.status !== 'protected'),
    [branches],
  );

  const selectedManualCount = selectableBranches.filter((branch) => selected.has(branch.name)).length;
  const allSelected = selectableBranches.length > 0 && selectableBranches.every((branch) => selected.has(branch.name));

  useEffect(() => {
    if (branches.length === 0) {
      setSelected(new Set());
      autoSelectArmedRef.current = true;
      return;
    }

    const normalizedCurrent = normalizeBranchName(currentBranch);
    const recommended = branches
      .filter((branch) => branch.shouldDelete && normalizeBranchName(branch.name) !== normalizedCurrent)
      .map((branch) => branch.name);

    setSelected((prev) => {
      const next = new Set<string>();
      prev.forEach((name) => {
        const branch = branches.find((entry) => entry.name === name);
        if (!branch) return;
        if (branch.status === 'active' || branch.status === 'protected') return;
        next.add(name);
      });

      if (next.size === 0 && autoSelectArmedRef.current) {
        recommended.forEach((name) => next.add(name));
        autoSelectArmedRef.current = false;
      }

      return next;
    });
  }, [branches, currentBranch]);

  const showWarning = (message: string) => {
    setWarningMsg(message);
    window.setTimeout(() => setWarningMsg(null), 3500);
  };

  const toggleAll = () => {
    autoSelectArmedRef.current = false;
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(selectableBranches.map((branch) => branch.name)));
  };

  const toggleOne = (name: string, status: BranchStatus) => {
    autoSelectArmedRef.current = false;
    if (status === 'active') {
      showWarning(t('branchCleanup.warning.active', { name }));
      return;
    }
    if (status === 'protected') {
      showWarning(t('branchCleanup.warning.protected', { name }));
      return;
    }

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const updateDraft = (patch: Partial<BranchCleanupSettings>) => {
    setDraftSettings((prev) => {
      const base = prev ?? cleanupSettings;
      if (!base) return prev;
      return { ...base, ...patch };
    });
  };

  const addProtectedBranch = () => {
    const name = newProtectedBranch.trim();
    if (!name || !draftSettings) return;
    if (draftSettings.protectedBranches.includes(name)) {
      showWarning(t('branchCleanup.warning.protectedExists'));
      return;
    }
    updateDraft({ protectedBranches: [...draftSettings.protectedBranches, name] });
    setNewProtectedBranch('');
  };

  const removeProtectedBranch = (name: string) => {
    if (!draftSettings || ['main', 'master'].includes(name)) return;
    updateDraft({ protectedBranches: draftSettings.protectedBranches.filter((entry) => entry !== name) });
  };

  const commitDraftSettings = () => {
    if (!draftSettings) {
      showWarning(t('branchCleanup.warning.settingsMissing'));
      return;
    }
    sendMessage('SAVE_BRANCH_CLEANUP_SETTINGS', { settings: draftSettings });
    setJustSaved(true);
    if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
    justSavedTimerRef.current = window.setTimeout(() => setJustSaved(false), 2000);
  };

  const isDirty = Boolean(draftSettings && cleanupSettings && !settingsEqual(draftSettings, cleanupSettings));

  const statusLabel = (status: BranchStatus) => t(`branchCleanup.status.${status}`);

  const showCleanupSectionBanner = showSectionBannersInline || isSettingMode;

  return (
    <div className="animate-fade-in" style={{ padding: '0 0 12px 0', height: '100%', display: 'flex', flexDirection: 'column', color: webviewBodyForeground }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderBottom: '1px solid var(--vscode-panel-border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          {isSettingMode ? (
            <button
              onClick={() => setIsSettingMode(false)}
              className="gitcat-icon-press"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                width: '26px',
                height: '26px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: vscodeSidebarViewTitleForeground,
                flexShrink: 0,
              }}
              aria-label={t('branchCleanup.header')}
              title={t('branchCleanup.header')}
            >
              <ArrowLeft size={16} />
            </button>
          ) : (
            <GitBranch size={14} style={{ color: vscodeSidebarViewTitleForeground, opacity: 0.88, flexShrink: 0 }} />
          )}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: vscodeSidebarViewTitleForeground,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {isSettingMode ? t('branchCleanup.settings') : t('branchCleanup.header')}
          </span>
        </div>
        {!isSettingMode && (
          <button
            onClick={() => setIsSettingMode(true)}
            className="gitcat-icon-press"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              width: '26px',
              height: '26px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: vscodeSidebarViewTitleForeground,
              opacity: 0.9,
              flexShrink: 0,
            }}
            title={t('branchCleanup.settings')}
            aria-label={t('branchCleanup.settings')}
          >
            <Settings size={16} />
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {showCleanupSectionBanner && (
          <SectionNotificationBanner
            notification={sectionNotifications.branchCleanup}
            onDismiss={dismissCleanupNotification}
          />
        )}

        {!isGitConnected ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ marginBottom: '12px', color: webviewDescriptionForeground, opacity: 0.55 }}>
              <ShieldCheck size={32} strokeWidth={1} style={{ margin: '0 auto' }} />
            </div>
            <div style={{ fontSize: '12px', color: webviewBodyForeground, opacity: 0.92, lineHeight: '1.6' }}>
              {t('branchCleanup.noRepository')}
            </div>
          </div>
        ) : isSettingMode ? (
          <div style={{ padding: '4px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {!draftSettings ? (
              <div
                style={{
                  padding: '18px 12px',
                  fontSize: '12px',
                  color: webviewBodyForeground,
                  opacity: 0.92,
                  border: '1px solid var(--vscode-panel-border)',
                  borderRadius: '6px',
                  textAlign: 'center',
                }}
              >
                {t('branchCleanup.settingsLoading')}
                <div style={{ marginTop: '10px' }}>
                  <button
                    onClick={() => sendMessage('GET_BRANCH_CLEANUP_SETTINGS', {})}
                    style={{
                      fontSize: '11px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--vscode-panel-border)',
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('branchCleanup.settingsRetry')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <section style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-sideBarSectionHeader-background)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sliders size={12} style={{ color: vscodeSidebarViewTitleForeground, opacity: 0.9 }} />
                      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: vscodeSidebarViewTitleForeground }}>
                        {t('branchCleanup.settingsSection')}
                      </span>
                    </div>
                  </div>

                  <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={draftSettings.enabled} onChange={(e) => updateDraft({ enabled: e.target.checked })} />
                      <span>{t('branchCleanup.settingsEnabled')}</span>
                    </label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontSize: '12px', opacity: 0.88 }}>{t('branchCleanup.settingsOlderThan')}</span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          value={draftSettings.olderThanValue}
                          onChange={(e) => updateDraft({ olderThanValue: parseInt(e.target.value, 10) || 1 })}
                          style={{
                            width: '64px',
                            padding: '6px',
                            fontSize: '12px',
                            textAlign: 'center',
                            background: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            border: '1px solid var(--vscode-panel-border)',
                            borderRadius: '4px',
                          }}
                        />
                        <select
                          value={draftSettings.olderThanUnit}
                          onChange={(e) => updateDraft({ olderThanUnit: e.target.value as BranchCleanupSettings['olderThanUnit'] })}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '12px',
                            background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
                            color: 'var(--vscode-dropdown-foreground, var(--vscode-input-foreground))',
                            border: '1px solid var(--vscode-panel-border)',
                            borderRadius: '4px',
                          }}
                        >
                          <option value="week">{t('branchCleanup.settingsWeek')}</option>
                          <option value="month">{t('branchCleanup.settingsMonth')}</option>
                        </select>
                      </div>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={draftSettings.deleteMergedBranches} onChange={(e) => updateDraft({ deleteMergedBranches: e.target.checked })} />
                      <span>{t('branchCleanup.settingsDeleteMerged')}</span>
                    </label>
                  </div>
                </section>

                <section style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-sideBarSectionHeader-background)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={12} style={{ color: vscodeSidebarViewTitleForeground, opacity: 0.9 }} />
                      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: vscodeSidebarViewTitleForeground }}>
                        {t('branchCleanup.protectedSection')}
                      </span>
                    </div>
                  </div>

                  <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {draftSettings.protectedBranches.map((name) => {
                        const isSystem = ['master', 'main'].includes(name);
                        return (
                          <div
                            key={name}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--vscode-panel-border)',
                              background: 'var(--vscode-editor-background)',
                              fontSize: '11px',
                              opacity: isSystem ? 0.76 : 1,
                            }}
                          >
                            {isSystem ? <Lock size={10} /> : <ShieldCheck size={10} />}
                            <span>{name}</span>
                            {!isSystem && (
                              <button
                                onClick={() => removeProtectedBranch(name)}
                                aria-label={name}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  color: 'var(--vscode-editor-foreground)',
                                  opacity: 0.85,
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
                        placeholder={t('branchCleanup.protectedPlaceholder')}
                        value={newProtectedBranch}
                        onChange={(e) => setNewProtectedBranch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addProtectedBranch()}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: '7px 8px',
                          fontSize: '12px',
                          background: 'var(--vscode-input-background)',
                          color: 'var(--vscode-input-foreground)',
                          border: '1px solid var(--vscode-panel-border)',
                          borderRadius: '4px',
                        }}
                      />
                      <button
                        onClick={addProtectedBranch}
                        className="gitcat-icon-press"
                        style={{
                          minWidth: '32px',
                          padding: '0 10px',
                          background: 'var(--vscode-button-background)',
                          color: 'var(--vscode-button-foreground)',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                        title={t('branchCleanup.protectedAddTitle')}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </section>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px' }}>
                  <button
                    onClick={() => updateDraft(DEFAULT_CLEANUP_SETTINGS)}
                    className="gitcat-icon-press"
                    style={{
                      fontSize: '11px',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--vscode-panel-border)',
                      background: 'var(--vscode-input-background)',
                      color: webviewBodyForeground,
                      opacity: 0.9,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t('branchCleanup.resetDefaults')}
                  </button>
                  <button
                    onClick={commitDraftSettings}
                    disabled={!isDirty && !justSaved}
                    className="gitcat-icon-press"
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
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
                      cursor: !isDirty && !justSaved ? 'default' : 'pointer',
                      opacity: !isDirty && !justSaved ? 0.55 : 1,
                    }}
                  >
                    {justSaved ? <Check size={14} /> : <Save size={14} />}
                    {justSaved ? t('branchCleanup.saved') : isDirty ? t('branchCleanup.save') : t('branchCleanup.noChanges')}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ padding: '4px 0' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 12px',
                cursor: selectableBranches.length > 0 ? 'pointer' : 'not-allowed',
                opacity: selectableBranches.length > 0 ? 1 : 0.6,
                marginBottom: '2px',
              }}
              onClick={toggleAll}
            >
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '3px',
                  border: '1.5px solid var(--vscode-panel-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: allSelected ? '#4ec9b0' : 'transparent',
                  borderColor: allSelected ? '#4ec9b0' : 'var(--vscode-panel-border)',
                }}
              >
                {allSelected && <ShieldCheck size={10} color="#fff" />}
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: vscodeSidebarViewTitleForeground,
                }}
              >
                {t('branchCleanup.selectable', {
                  selected: selectedManualCount,
                  total: selectableBranches.length,
                })}
              </span>
            </div>

            <div style={{ marginTop: '2px' }}>
              {branches.map((branch) => {
                const isChecked = selected.has(branch.name);
                const isLocked = branch.status === 'active' || branch.status === 'protected';

                return (
                  <div
                    key={branch.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 16px',
                      cursor: isLocked ? 'default' : 'pointer',
                      background: isChecked ? 'rgba(78, 201, 176, 0.08)' : 'transparent',
                      borderLeft: isChecked ? '2px solid #4ec9b0' : '2px solid transparent',
                    }}
                    onMouseOver={(e) => {
                      if (!isChecked && !isLocked) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
                    }}
                    onMouseOut={(e) => {
                      if (!isChecked && !isLocked) e.currentTarget.style.background = 'transparent';
                    }}
                    onClick={() => toggleOne(branch.name, branch.status)}
                  >
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        border: '1.5px solid var(--vscode-panel-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isChecked ? 'var(--vscode-button-background)' : 'transparent',
                        borderColor: isChecked ? 'var(--vscode-button-background)' : 'var(--vscode-panel-border)',
                        opacity: isLocked ? 0.3 : 1,
                      }}
                    >
                      {isChecked && <ShieldCheck size={12} color="var(--vscode-button-foreground)" />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: isChecked ? 600 : 400, color: vscodeSidebarViewTitleForeground, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {branch.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: webviewBodyForeground, marginTop: '3px', opacity: 0.78 }}>
                        <Clock size={10} />
                        {branch.lastActivity}
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: '4px',
                        flexShrink: 0,
                        color: STATUS_COLOR[branch.status],
                        background: STATUS_BG[branch.status],
                        border: `1px solid ${STATUS_COLOR[branch.status]}22`,
                      }}
                    >
                      {statusLabel(branch.status)}
                    </span>

                    {branch.shouldDelete && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          flexShrink: 0,
                          color: '#4ec9b0',
                          background: 'rgba(78, 201, 176, 0.12)',
                          border: '1px solid rgba(78, 201, 176, 0.35)',
                        }}
                      >
                        {t('branchCleanup.recommended')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {warningMsg && (
              <div
                style={{
                  margin: '16px',
                  padding: '10px 12px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: 'var(--vscode-errorForeground)',
                  background: 'rgba(241, 76, 76, 0.08)',
                  border: '1px solid var(--vscode-inputValidation-errorBorder)',
                  borderRadius: '6px',
                }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, lineHeight: 1.4 }}>{warningMsg}</span>
              </div>
            )}

            {selected.size > 0 && (
              <div style={{ padding: '16px 16px 8px 16px' }}>
                <button
                  onClick={() => setShowConfirmModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    height: '32px',
                    background: 'var(--vscode-button-background)',
                    color: 'var(--vscode-button-foreground)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  <Trash2 size={14} />
                  {t('branchCleanup.deleteSelected', { count: selected.size })}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showConfirmModal && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
          onClick={() => setShowConfirmModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              background: 'var(--vscode-editor-background)',
              borderRadius: '12px',
              border: '1px solid var(--vscode-panel-border)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '16px', borderBottom: '1px solid var(--vscode-panel-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--vscode-errorForeground)', marginBottom: '4px' }}>
                <AlertTriangle size={18} />
                <span style={{ fontWeight: 700, fontSize: '14px' }}>{t('branchCleanup.deleteConfirmTitle')}</span>
              </div>
              <p style={{ fontSize: '12px', color: webviewBodyForeground, opacity: 0.88, margin: 0 }}>
                {t('branchCleanup.deleteConfirmBody', { count: selected.size })}
              </p>
            </div>

            <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{
                  border: '1px solid var(--vscode-panel-border)',
                  background: 'transparent',
                  color: 'var(--vscode-foreground)',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                }}
              >
                {t('git.cancel')}
              </button>
              <button
                onClick={() => {
                  sendMessage('EXECUTE_BRANCH_CLEANUP', { branchNames: Array.from(selected) });
                  setSelected(new Set());
                  setShowConfirmModal(false);
                }}
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
                {t('branchCleanup.deleteSelected', { count: selected.size })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
