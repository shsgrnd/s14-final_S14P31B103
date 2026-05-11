import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAiApiKeyStorage } from '../../hooks/useAiApiKeyStorage';
import { validateAiApiKeyInput } from '../../shared/aiApiKeyValidate';

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
  const { hasKey, saveKey, clearKey } = useAiApiKeyStorage();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const descId = useId();
  const prHintId = useId();

  useEffect(() => {
    if (!open) {
      setInput('');
      setError(null);
      setFeedback(null);
      return;
    }
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

  const trimmed = input.trim();
  const validationPreview = trimmed ? validateAiApiKeyInput(trimmed) : null;
  const canSave = Boolean(trimmed) && !validationPreview;

  const onSave = () => {
    const next = input.trim();
    const v = validateAiApiKeyInput(next);
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    saveKey(next);
    setInput('');
    setFeedback({
      tone: 'success',
      text: '안전한 내부 저장소(SecretStorage)에 저장되었습니다. 이제 AI 기능을 사용할 수 있습니다.',
    });
  };

  const onClear = () => {
    setError(null);
    clearKey();
    setInput('');
    setFeedback({ tone: 'info', text: '저장된 키를 안전하게 삭제했습니다.' });
  };

  const onInputChange = (v: string) => {
    setInput(v);
    setError(null);
    setFeedback(null);
  };

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gitcat-ai-key-title"
      aria-describedby={`${descId} ${prHintId}`}
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
          AI API 키
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
          입력값은 마스킹되어 표시됩니다. 입력하신 키는 VS Code의 안전한 내부 저장소(SecretStorage)에 보관되며, 콘솔 로그나{' '}
          <code style={{ fontSize: '10px' }}>SET_CONFIG</code>로 유출되지 않습니다.
        </p>

        {hasKey && (
          <div
            style={{
              marginBottom: '10px',
              fontSize: '11px',
              color: 'var(--vscode-charts-green)',
            }}
          >
            이미 저장된 키가 있습니다. 새 키로 덮어쓰거나 삭제할 수 있습니다.
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
          API 키
        </label>
        <input
          id="gitcat-ai-api-key-input"
          ref={inputRef}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={hasKey ? '새 키를 입력하면 기존 값을 덮어씁니다' : 'sk-… 또는 GMS 키'}
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
        {trimmed && validationPreview && (
          <div style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', marginBottom: '6px' }}>
            {validationPreview}
          </div>
        )}

        {error && (
          <div style={{ fontSize: '11px', color: 'var(--vscode-errorForeground)', marginBottom: '8px' }}>{error}</div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
          {hasKey && (
            <button type="button" onClick={onClear} style={secondaryBtn}>
              삭제
            </button>
          )}
          <button type="button" onClick={onClose} style={secondaryBtn}>
            닫기
          </button>
          <button type="button" onClick={onSave} disabled={!canSave} style={canSave ? primaryBtn : primaryBtnDisabled}>
            저장
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
