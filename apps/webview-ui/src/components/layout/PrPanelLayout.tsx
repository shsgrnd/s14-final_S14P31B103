import React, { useState, useEffect } from 'react';
import { Sparkles, Check, X, RefreshCw, GitPullRequest } from 'lucide-react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { resolvePullRequestBaseBranch } from '../../features/pull-request/resolvePullRequestBaseBranch';

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
  } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();

  const [prTitle, setPrTitle] = useState('');
  const [prDescription, setPrDescription] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [hasRequestedInitialRecommendation, setHasRequestedInitialRecommendation] = useState(false);
  const isRecommendationInProgress = isPrLoading;
  const canCreatePr = Boolean(prTitle.trim() && prDescription.trim() && baseBranch && currentBranch);

  useEffect(() => {
    if (baseBranch) return;
    const resolvedBaseBranch = resolvePullRequestBaseBranch({ branches, currentBranch });
    if (resolvedBaseBranch) setBaseBranch(resolvedBaseBranch);
  }, [baseBranch, branches, currentBranch]);

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
    sendMessage('CREATE_PR', {
      title: prTitle,
      description: prDescription,
      base: baseBranch,
      headBranch: currentBranch,
    });
  };

  return (
    <div style={{
      height: '100vh', width: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)',
      padding: '20px', boxSizing: 'border-box', overflowY: 'auto'
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

      {isRecommendationInProgress && (
        <div style={{
          maxWidth: '800px',
          margin: '0 auto 12px auto',
          width: '100%',
          border: '1px solid var(--vscode-focusBorder)',
          borderRadius: '6px',
          padding: '8px 10px',
          fontSize: '12px',
          color: 'var(--vscode-descriptionForeground)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'color-mix(in srgb, var(--vscode-editor-background) 80%, var(--vscode-focusBorder) 20%)',
        }}>
          <RefreshCw size={13} style={{ animation: 'gitcat-refresh-spin 1s linear infinite' }} />
          PR title/description를 AI가 추천 중입니다. 완료될 때까지 잠시 기다려주세요.
        </div>
      )}

      <div style={{ position: 'relative', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
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
          <select
            value={baseBranch}
            onChange={e => setBaseBranch(e.target.value)}
            disabled={isRecommendationInProgress}
            style={{
              padding: '8px 12px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
              border: `1px solid ${baseBranch ? 'var(--vscode-input-border, var(--vscode-panel-border))' : 'var(--vscode-focusBorder)'}`,
              borderRadius: '4px', outline: 'none', fontSize: '13px', cursor: isRecommendationInProgress ? 'not-allowed' : 'pointer',
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
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vscode-foreground)' }}>Description (Markdown)</label>
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
    </div>
  );
};
