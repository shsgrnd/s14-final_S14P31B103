import React, { useState, useEffect } from 'react';
import { Sparkles, Check, RefreshCw, GitPullRequest, ChevronDown, CheckCircle2, AlertTriangle, ExternalLink, X } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { resolvePullRequestBaseBranch } from '../../features/pull-request/resolvePullRequestBaseBranch';
import { useDefaultPrBaseBranch } from '../../hooks/useDefaultPrBaseBranch';
import { PrCreateMetadataSidebar } from './PrCreateMetadataSidebar';
import { MarkdownPreview } from '../common/MarkdownPreview';

type DescriptionMode = 'write' | 'preview';

function inferTitleFromMarkdown(markdown: string): string {
  const firstLine = markdown.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
  const normalized = firstLine.replace(/^#+\s*/, '');
  return normalized.slice(0, 120) || 'AI 추천 PR 제목';
}

export const PrPanelLayout: React.FC = () => {
  const {
    prSuggestion,
    isPrLoading,
    isCreatingPr,
    clearPrSuggestion,
    branches,
    currentBranch,
    beginRecommendationRequest,
    prRecommendationError,
    clearPrRecommendationError,
    prFormMetadata,
    isPrFormMetadataLoading,
    lastCreatedPr,
    clearLastCreatedPr,
    sectionNotifications,
    clearSectionNotification,
  } = useGitCatStore();
  const prResultBanner = lastCreatedPr;
  const prErrorBanner =
    sectionNotifications.git && sectionNotifications.git.type === 'error'
      ? sectionNotifications.git
      : null;
  const { sendMessage } = useVsCodeApi();
  const { defaultBranch: userDefaultBaseBranch } = useDefaultPrBaseBranch();

  const [prTitle, setPrTitle] = useState('');
  const [prDescription, setPrDescription] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [prReviewers, setPrReviewers] = useState<string[]>([]);
  const [prAssignees, setPrAssignees] = useState<string[]>([]);
  const [prLabels, setPrLabels] = useState<string[]>([]);
  const [prMilestone, setPrMilestone] = useState<number | null>(null);
  const [descriptionMode, setDescriptionMode] = useState<DescriptionMode>('write');
  const [hasRequestedInitialRecommendation, setHasRequestedInitialRecommendation] = useState(false);
  const isRecommendationInProgress = isPrLoading;
  const canCreatePr = Boolean(prTitle.trim() && prDescription.trim() && baseBranch && currentBranch);

  useEffect(() => {
    sendMessage('GET_PR_FORM_METADATA', {});
  }, [sendMessage]);

  // GitHub은 PR 작성자 본인을 reviewer로 받지 않는다.
  // 메타데이터가 도착하면 reviewers 배열에서 본인을 자동으로 제거한다.
  useEffect(() => {
    const me = prFormMetadata?.currentUserLogin;
    if (!me) return;
    setPrReviewers((prev) => (prev.includes(me) ? prev.filter((login) => login !== me) : prev));
  }, [prFormMetadata?.currentUserLogin]);

  const handleReviewersChange = (next: string[]) => {
    const me = prFormMetadata?.currentUserLogin;
    setPrReviewers(me ? next.filter((login) => login !== me) : next);
  };

  useEffect(() => {
    if (baseBranch) return;
    // 사용자 환경설정(기본 target 브랜치) 응답이 도착하기 전엔 추론을 보류한다.
    // 이렇게 하지 않으면 응답 직전엔 protected/main fallback이 먼저 적용되어 사용자 설정이
    // 무시되는 것처럼 보인다. (workspaceState 응답은 일반적으로 즉시 도착하므로
    // 사용자에게는 거의 보이지 않는 지연이다.)
    if (userDefaultBaseBranch === undefined) return;
    const resolvedBaseBranch = resolvePullRequestBaseBranch({
      branches,
      currentBranch,
      defaultBaseBranch: userDefaultBaseBranch ?? undefined,
    });
    if (resolvedBaseBranch) setBaseBranch(resolvedBaseBranch);
  }, [baseBranch, branches, currentBranch, userDefaultBaseBranch]);

  useEffect(() => {
    setHasRequestedInitialRecommendation(false);
  }, [baseBranch]);

  useEffect(() => {
    if (hasRequestedInitialRecommendation || !baseBranch || !currentBranch) return;
    beginRecommendationRequest('pr');
    sendMessage('RECOMMEND_PR', { base: baseBranch });
    setHasRequestedInitialRecommendation(true);
  }, [baseBranch, currentBranch, hasRequestedInitialRecommendation, sendMessage, beginRecommendationRequest]);

  // AI 추천 결과 수신 시 폼 자동 입력 (항상 최신 추천으로 덮어씀)
  useEffect(() => {
    if (prSuggestion) {
      setPrTitle(prSuggestion.title?.trim() ? prSuggestion.title : inferTitleFromMarkdown(prSuggestion.markdown));
      setPrDescription(prSuggestion.markdown);
      clearPrSuggestion();
    }
  }, [prSuggestion, clearPrSuggestion]);

  const handleSubmit = () => {
    if (!canCreatePr) return;
    clearLastCreatedPr();
    clearSectionNotification('git');
    sendMessage('CREATE_PR', {
      title: prTitle,
      description: prDescription,
      base: baseBranch,
      headBranch: currentBranch,
      ...(prReviewers.length > 0 ? { reviewers: prReviewers } : {}),
      ...(prAssignees.length > 0 ? { assignees: prAssignees } : {}),
      ...(prLabels.length > 0 ? { labels: prLabels } : {}),
      ...(prMilestone != null ? { milestone: prMilestone } : {}),
    });
  };

  return (
    <div style={{
      height: '100vh', width: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)',
      padding: '20px', boxSizing: 'border-box', overflowY: 'auto', minHeight: 0,
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <GitPullRequest size={24} style={{ color: 'var(--vscode-charts-blue)' }} />
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Create Pull Request</h1>

        <div style={{ flex: 1 }} />
        {prRecommendationError && (
          <div style={{
            marginRight: '12px',
            maxWidth: '320px',
            fontSize: '11px',
            color: 'var(--vscode-errorForeground)',
            lineHeight: 1.4,
            textAlign: 'right',
          }}>
            {prRecommendationError}
          </div>
        )}

        <button
          onClick={() => {
            clearPrRecommendationError();
            beginRecommendationRequest('pr');
            sendMessage('RECOMMEND_PR', { base: baseBranch });
          }}
          disabled={isPrLoading || !baseBranch}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
            border: 'none', padding: '6px 12px', borderRadius: '4px',
            cursor: (isPrLoading || !baseBranch) ? 'not-allowed' : 'pointer', opacity: (isPrLoading || !baseBranch) ? 0.7 : 1,
            fontWeight: 500, fontSize: '12px'
          }}
        >
          {isPrLoading ? <RefreshCw size={14} style={{ animation: 'gitcat-refresh-spin 1s linear infinite' }} /> : <Sparkles size={14} />}
          AI 설명 추천
        </button>
      </header>

      {prResultBanner && (
        <div
          role="status"
          aria-live="polite"
          style={{
            maxWidth: '1180px',
            margin: '0 auto 12px auto',
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: 8,
            border: `1px solid ${
              (prResultBanner.metadataWarnings?.length ?? 0) > 0
                ? 'var(--vscode-inputValidation-warningBorder)'
                : 'var(--vscode-charts-green)'
            }`,
            background:
              (prResultBanner.metadataWarnings?.length ?? 0) > 0
                ? 'var(--vscode-inputValidation-warningBackground)'
                : 'rgba(78, 201, 176, 0.12)',
            padding: '10px 12px',
            color: 'var(--vscode-foreground)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {(prResultBanner.metadataWarnings?.length ?? 0) > 0 ? (
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1, color: 'var(--vscode-editorWarning-foreground)' }} />
          ) : (
            <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1, color: 'var(--vscode-charts-green)' }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {(prResultBanner.metadataWarnings?.length ?? 0) > 0
                ? `PR #${prResultBanner.prNumber}이(가) 생성됐지만 일부 설정이 적용되지 않았습니다.`
                : `PR #${prResultBanner.prNumber}이(가) 생성됐습니다.`}
            </div>
            <div style={{ marginBottom: (prResultBanner.metadataWarnings?.length ?? 0) > 0 ? 6 : 0 }}>
              <span style={{ opacity: 0.85 }}>{prResultBanner.title}</span>{' '}
              <a
                href={prResultBanner.htmlUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginLeft: 4,
                  color: 'var(--vscode-textLink-foreground)',
                  textDecoration: 'underline',
                }}
              >
                GitHub에서 보기 <ExternalLink size={12} />
              </a>
            </div>
            {(prResultBanner.metadataWarnings?.length ?? 0) > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {prResultBanner.metadataWarnings!.map((w, idx) => (
                  <li key={idx} style={{ marginBottom: 2 }}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {prErrorBanner && (
        <div
          role="alert"
          style={{
            maxWidth: '1180px',
            margin: '0 auto 12px auto',
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: 8,
            border: '1px solid var(--vscode-inputValidation-errorBorder)',
            background: 'var(--vscode-inputValidation-errorBackground)',
            color: 'var(--vscode-errorForeground)',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ flex: 1, minWidth: 0 }}>{prErrorBanner.message}</span>
          <button
            type="button"
            aria-label="에러 닫기"
            onClick={() => clearSectionNotification('git')}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              padding: 2,
              opacity: 0.8,
            }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {isRecommendationInProgress && (
        <div
          style={{
            maxWidth: '1180px',
            margin: '0 auto 12px auto',
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: '8px',
            border: '1px solid var(--vscode-focusBorder)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              boxSizing: 'border-box',
              padding: '10px 12px',
              fontSize: '12px',
              lineHeight: 1.45,
              color: 'var(--vscode-descriptionForeground)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'color-mix(in srgb, var(--vscode-editor-background) 80%, var(--vscode-focusBorder) 20%)',
            }}
          >
            <RefreshCw
              size={14}
              style={{
                flexShrink: 0,
                animation: 'gitcat-refresh-spin 1s linear infinite',
                alignSelf: 'center',
              }}
            />
            <span style={{ minWidth: 0 }}>
              PR title/description를 AI가 추천 중입니다. 완료될 때까지 잠시 기다려주세요.
            </span>
          </div>
        </div>
      )}

      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 24,
        alignItems: 'flex-start',
        justifyContent: 'center',
        maxWidth: 1180,
        margin: '0 auto',
        width: '100%',
        flex: 1,
        minHeight: 0,
      }}>
        <div style={{ flex: '1 1 420px', minWidth: 280, maxWidth: 800, position: 'relative', width: '100%' }}>
        {isRecommendationInProgress && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            background: 'rgba(0, 0, 0, 0.08)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
            cursor: 'wait',
          }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: 'var(--vscode-foreground)',
              padding: '8px 10px',
              borderRadius: '4px',
              border: '1px solid var(--vscode-panel-border)',
              background: 'var(--vscode-editor-background)',
            }}>
              <RefreshCw size={14} style={{ animation: 'gitcat-refresh-spin 1s linear infinite' }} />
              추천 생성 중...
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vscode-foreground)' }}>Target Branch (Base)</label>
          <div style={{ position: 'relative', width: '100%' }}>
            <select
              value={baseBranch}
              onChange={e => setBaseBranch(e.target.value)}
              disabled={isRecommendationInProgress}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                padding: '8px 40px 8px 12px',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: `1px solid ${baseBranch ? 'var(--vscode-input-border, var(--vscode-panel-border))' : 'var(--vscode-focusBorder)'}`,
                borderRadius: '6px',
                outline: 'none',
                fontSize: '13px',
                cursor: isRecommendationInProgress ? 'not-allowed' : 'pointer',
                opacity: isRecommendationInProgress ? 0.75 : 1,
              }}
            >
              <option value="" disabled>타겟 브랜치를 선택하세요</option>
              {branches
                .filter(b => !b.isRemote && b.name !== currentBranch)
                .map(b => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
            </select>
            <ChevronDown
              size={16}
              aria-hidden
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: 'var(--vscode-input-foreground)',
                opacity: 0.72,
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vscode-foreground)' }}>Title</label>
          <input
            autoFocus
            value={prTitle}
            onChange={e => setPrTitle(e.target.value)}
            disabled={isRecommendationInProgress}
            placeholder="PR 제목을 입력하세요"
            maxLength={256}
            style={{
              padding: '8px 12px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))', borderRadius: '4px',
              outline: 'none', fontSize: '13px', opacity: isRecommendationInProgress ? 0.75 : 1,
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vscode-foreground)' }}>Description (Markdown)</label>
            <div
              role="tablist"
              aria-label="설명 편집 모드"
              style={{
                display: 'inline-flex',
                padding: 2,
                background: 'var(--vscode-input-background)',
                border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
                borderRadius: 6,
              }}
            >
              {(['write', 'preview'] as const).map((mode) => {
                const active = descriptionMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setDescriptionMode(mode)}
                    disabled={isRecommendationInProgress}
                    style={{
                      border: 'none',
                      padding: '4px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 4,
                      cursor: isRecommendationInProgress ? 'not-allowed' : 'pointer',
                      background: active ? 'var(--vscode-button-secondaryBackground)' : 'transparent',
                      color: active
                        ? 'var(--vscode-button-secondaryForeground)'
                        : 'var(--vscode-descriptionForeground)',
                    }}
                  >
                    {mode === 'write' ? 'Write' : 'Preview'}
                  </button>
                );
              })}
            </div>
          </div>
          {descriptionMode === 'write' ? (
            <textarea
              value={prDescription}
              onChange={e => setPrDescription(e.target.value)}
              disabled={isRecommendationInProgress}
              placeholder="이 PR에서 변경된 내용, 해결된 이슈 등을 상세히 적어주세요."
              maxLength={65536}
              style={{
                padding: '12px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))', borderRadius: '4px',
                outline: 'none', fontSize: '13px', minHeight: '300px', resize: 'vertical', fontFamily: 'var(--vscode-editor-font-family, monospace)',
                lineHeight: '1.5', opacity: isRecommendationInProgress ? 0.75 : 1,
              }}
            />
          ) : (
            <div
              role="tabpanel"
              aria-label="Preview"
              style={{
                padding: '12px 14px',
                background: 'var(--vscode-input-background)',
                border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
                borderRadius: '4px',
                minHeight: '300px',
                maxHeight: '60vh',
                overflowY: 'auto',
                opacity: isRecommendationInProgress ? 0.75 : 1,
              }}
            >
              <MarkdownPreview
                source={prDescription}
                emptyMessage="아직 입력된 내용이 없습니다. Write 탭에서 내용을 작성해 주세요."
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
          <button
            onClick={handleSubmit}
            disabled={!canCreatePr || isCreatingPr || isRecommendationInProgress}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)',
              border: 'none', padding: '8px 16px', borderRadius: '4px',
              cursor: (!canCreatePr || isCreatingPr || isRecommendationInProgress) ? 'not-allowed' : 'pointer',
              opacity: (!canCreatePr || isCreatingPr || isRecommendationInProgress) ? 0.5 : 1,
              fontWeight: 500, fontSize: '13px'
            }}
          >
            {isCreatingPr ? (
              <>
                <RefreshCw size={16} style={{ animation: 'gitcat-refresh-spin 1s linear infinite' }} />
                Creating...
              </>
            ) : (
              <>
                <Check size={16} /> Create Pull Request
              </>
            )}
          </button>
        </div>
      </div>
        </div>

        <PrCreateMetadataSidebar
          metadata={prFormMetadata}
          loading={isPrFormMetadataLoading}
          disabled={isRecommendationInProgress}
          reviewers={prReviewers}
          assignees={prAssignees}
          labels={prLabels}
          milestoneNumber={prMilestone}
          onReviewersChange={handleReviewersChange}
          onAssigneesChange={setPrAssignees}
          onLabelsChange={setPrLabels}
          onMilestoneChange={setPrMilestone}
          onRetryLoad={() => sendMessage('GET_PR_FORM_METADATA', {})}
        />
      </div>
    </div>
  );
};
