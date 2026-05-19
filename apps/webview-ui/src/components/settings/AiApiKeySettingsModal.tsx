import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAiApiKeyStorage } from '../../hooks/useAiApiKeyStorage';
import {
  validateAiApiKeyInput,
  validateAiRemoteBaseUrlInput,
  validateAiRemoteModelInput,
} from '../../shared/aiApiKeyValidate';
import { t } from '../../i18n';

export interface AiApiKeySettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type Feedback = { tone: 'success' | 'info'; text: string } | null;

/**
 * 사이드바 푸터 설정(톱니)에서 열리는 AI API 키 입력 UI.
 * document.body로 포털하여 overflow 레이아웃 밖에서 웹뷰 뷰포트 기준 오버레이로 표시한다.
 */
export const AiApiKeySettingsModal: React.FC<AiApiKeySettingsModalProps> = ({ open, onClose }) => {
  const {
    aiMode,
    hasKey,
    hasStoredKey,
    remoteBaseUrl,
    remoteModel,
    saveSettings,
    clearKey,
  } = useAiApiKeyStorage();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [remoteBaseUrlInput, setRemoteBaseUrlInput] = useState('');
  const [remoteModelInput, setRemoteModelInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const descId = useId();
  const remoteDescId = useId();

  useEffect(() => {
    if (!open) {
      setApiKeyInput('');
      setRemoteBaseUrlInput('');
      setRemoteModelInput('');
      setError(null);
      setFeedback(null);
      return;
    }
    setApiKeyInput('');
    setRemoteBaseUrlInput(remoteBaseUrl);
    setRemoteModelInput(remoteModel);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isRemoteMode = aiMode === 'live-remote';
  const trimmedKey = apiKeyInput.trim();
  const trimmedRemoteBaseUrl = remoteBaseUrlInput.trim();
  const trimmedRemoteModel = remoteModelInput.trim();
  const apiKeyValidation = trimmedKey ? validateAiApiKeyInput(trimmedKey) : null;
  const remoteBaseUrlValidation = trimmedRemoteBaseUrl ? validateAiRemoteBaseUrlInput(trimmedRemoteBaseUrl) : null;
  const remoteModelValidation = trimmedRemoteModel ? validateAiRemoteModelInput(trimmedRemoteModel) : null;
  const effectiveHasKey = hasKey || Boolean(trimmedKey);
  const remoteFieldsValid = !isRemoteMode || (
    Boolean(trimmedRemoteBaseUrl)
    && Boolean(trimmedRemoteModel)
    && !remoteBaseUrlValidation
    && !remoteModelValidation
  );
  const describedBy = isRemoteMode ? `${descId} ${remoteDescId}` : descId;
  const hasSavePayload = Boolean(trimmedKey) || isRemoteMode;
  const canSave = effectiveHasKey
    && hasSavePayload
    && (!trimmedKey || !apiKeyValidation)
    && remoteFieldsValid;

  const onSave = () => {
    if (!effectiveHasKey) {
      setError(t('settings.ai.keyRequired'));
      return;
    }

    if (trimmedKey) {
      const keyError = validateAiApiKeyInput(trimmedKey);
      if (keyError) {
        setError(keyError);
        return;
      }
    }

    if (isRemoteMode) {
      const baseUrlError = validateAiRemoteBaseUrlInput(trimmedRemoteBaseUrl);
      if (baseUrlError) {
        setError(baseUrlError);
        return;
      }
      const modelError = validateAiRemoteModelInput(trimmedRemoteModel);
      if (modelError) {
        setError(modelError);
        return;
      }
    }

    saveSettings({
      apiKey: trimmedKey || undefined,
      remoteBaseUrl: isRemoteMode ? trimmedRemoteBaseUrl : undefined,
      remoteModel: isRemoteMode ? trimmedRemoteModel : undefined,
    });
    setError(null);
    setApiKeyInput('');
    setFeedback({
      tone: 'success',
      text: t('settings.ai.success'),
    });
  };

  const onClear = () => {
    setError(null);
    clearKey();
    setApiKeyInput('');
    setFeedback({ tone: 'info', text: t('settings.ai.cleared') });
  };

  const resetFeedback = () => {
    setError(null);
    setFeedback(null);
  };

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gitcat-ai-key-title"
      aria-describedby={describedBy}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        zIndex: 2147483646,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
        background: 'rgba(0,0,0,0.5)',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          borderRadius: '8px',
          border: '1px solid var(--vscode-widget-border)',
          background: 'var(--vscode-editorWidget-background)',
          color: 'var(--vscode-editorWidget-foreground)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          padding: '16px 18px',
          boxSizing: 'border-box',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="gitcat-ai-key-title" style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700 }}>
          {t('settings.ai.title')}
        </h2>
        <p
          id={descId}
          style={{
            margin: '0 0 10px',
            fontSize: '11px',
            lineHeight: 1.55,
            color: 'var(--vscode-descriptionForeground)',
          }}
        >
          {t('settings.ai.desc')}
        </p>

        {hasKey && (
          <div
            style={{
              marginBottom: '10px',
              fontSize: '11px',
              color: 'var(--vscode-charts-green)',
            }}
          >
            {t('settings.ai.hasKey')}
          </div>
        )}

        {isRemoteMode && (
          <div
            id={remoteDescId}
            style={{
              marginBottom: '10px',
              fontSize: '11px',
              lineHeight: 1.45,
              color: 'var(--vscode-descriptionForeground)',
            }}
          >
            {t('settings.ai.remoteDesc')}
          </div>
        )}

        {feedback && (
          <div
            role="status"
            style={{
              marginBottom: '10px',
              fontSize: '11px',
              lineHeight: 1.45,
              color: feedback.tone === 'success' ? 'var(--vscode-charts-green)' : 'var(--vscode-descriptionForeground)',
            }}
          >
            {feedback.text}
          </div>
        )}

        <label
          htmlFor="gitcat-ai-api-key-input"
          style={{
            display: 'block',
            fontSize: '11px',
            marginBottom: '6px',
            color: 'var(--vscode-descriptionForeground)',
          }}
        >
          {t('settings.ai.label')}
        </label>
        <input
          id="gitcat-ai-api-key-input"
          ref={inputRef}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKeyInput}
          onChange={(e) => {
            setApiKeyInput(e.target.value);
            resetFeedback();
          }}
          placeholder={hasKey ? t('settings.ai.placeholderOverwrite') : t('settings.ai.placeholder')}
          aria-invalid={error ? 'true' : 'false'}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '8px 10px',
            fontSize: '12px',
            borderRadius: '4px',
            border: `1px solid ${error ? 'var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground))' : 'var(--vscode-input-border)'}`,
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            marginBottom: '4px',
          }}
        />
        {trimmedKey && apiKeyValidation && (
          <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', marginBottom: '6px' }}>
            {apiKeyValidation}
          </div>
        )}

        {isRemoteMode && (
          <>
            <label
              htmlFor="gitcat-ai-remote-base-url-input"
              style={{
                display: 'block',
                fontSize: '11px',
                marginTop: '10px',
                marginBottom: '6px',
                color: 'var(--vscode-descriptionForeground)',
              }}
            >
              {t('settings.ai.remoteBaseUrlLabel')}
            </label>
            <input
              id="gitcat-ai-remote-base-url-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={remoteBaseUrlInput}
              onChange={(e) => {
                setRemoteBaseUrlInput(e.target.value);
                resetFeedback();
              }}
              placeholder={t('settings.ai.remoteBaseUrlPlaceholder')}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                fontSize: '12px',
                borderRadius: '4px',
                border: '1px solid var(--vscode-input-border)',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                marginBottom: '4px',
              }}
            />
            {trimmedRemoteBaseUrl && remoteBaseUrlValidation && (
              <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', marginBottom: '6px' }}>
                {remoteBaseUrlValidation}
              </div>
            )}

            <label
              htmlFor="gitcat-ai-remote-model-input"
              style={{
                display: 'block',
                fontSize: '11px',
                marginTop: '10px',
                marginBottom: '6px',
                color: 'var(--vscode-descriptionForeground)',
              }}
            >
              {t('settings.ai.remoteModelLabel')}
            </label>
            <input
              id="gitcat-ai-remote-model-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={remoteModelInput}
              onChange={(e) => {
                setRemoteModelInput(e.target.value);
                resetFeedback();
              }}
              placeholder={t('settings.ai.remoteModelPlaceholder')}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                fontSize: '12px',
                borderRadius: '4px',
                border: '1px solid var(--vscode-input-border)',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                marginBottom: '4px',
              }}
            />
            {trimmedRemoteModel && remoteModelValidation && (
              <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', marginBottom: '6px' }}>
                {remoteModelValidation}
              </div>
            )}
          </>
        )}

        {error && (
          <div style={{ fontSize: '11px', color: 'var(--vscode-errorForeground)', marginBottom: '8px' }}>{error}</div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
          {hasStoredKey && (
            <button type="button" onClick={onClear} style={secondaryBtn}>
              {t('settings.ai.delete')}
            </button>
          )}
          <button type="button" onClick={onClose} style={secondaryBtn}>
            {t('settings.ai.close')}
          </button>
          <button type="button" onClick={onSave} disabled={!canSave} style={canSave ? primaryBtn : primaryBtnDisabled}>
            {t('settings.ai.save')}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

const secondaryBtn: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '12px',
  cursor: 'pointer',
  borderRadius: '4px',
  border: '1px solid var(--vscode-button-secondaryBorder, var(--vscode-contrastBorder))',
  background: 'var(--vscode-button-secondaryBackground)',
  color: 'var(--vscode-button-secondaryForeground)',
};

const primaryBtn: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '12px',
  cursor: 'pointer',
  borderRadius: '4px',
  border: 'none',
  background: 'var(--vscode-button-background)',
  color: 'var(--vscode-button-foreground)',
};

const primaryBtnDisabled: React.CSSProperties = {
  ...primaryBtn,
  opacity: 0.45,
  cursor: 'not-allowed',
};
