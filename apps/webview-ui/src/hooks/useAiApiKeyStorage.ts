import { useCallback, useEffect, useState } from 'react';
import { sendMessage } from './useVsCodeApi';

export type AiMode = 'live-local' | 'live-remote';

export interface SaveAiSettingsInput {
  apiKey?: string;
  remoteBaseUrl?: string;
  remoteModel?: string;
}

export interface AiSettingsState {
  hasKey: boolean;
  hasStoredKey: boolean;
  aiMode: AiMode;
  remoteBaseUrl: string;
  remoteModel: string;
}

/**
 * AI 키 저장 여부를 React와 동기화한다. (Extension의 SecretStorage 연동)
 */
export function useAiApiKeyStorage() {
  const [state, setState] = useState<AiSettingsState>({
    hasKey: false,
    hasStoredKey: false,
    aiMode: 'live-local',
    remoteBaseUrl: '',
    remoteModel: '',
  });

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg && msg.type === 'AI_API_KEY_STATUS' && msg.payload) {
        setState({
          hasKey: Boolean(msg.payload.hasKey),
          hasStoredKey: Boolean(msg.payload.hasStoredKey),
          aiMode: msg.payload.aiMode === 'live-remote' ? 'live-remote' : 'live-local',
          remoteBaseUrl: typeof msg.payload.remoteBaseUrl === 'string' ? msg.payload.remoteBaseUrl : '',
          remoteModel: typeof msg.payload.remoteModel === 'string' ? msg.payload.remoteModel : '',
        });
      }
    };
    window.addEventListener('message', handleMessage);
    
    // 초기 마운트 시 키 상태 요청
    sendMessage('CHECK_AI_API_KEY', {});

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const saveSettings = useCallback((input: SaveAiSettingsInput) => {
    sendMessage('SAVE_AI_API_KEY', input);
  }, []);

  const clearKey = useCallback(() => {
    sendMessage('DELETE_AI_API_KEY', {});
  }, []);

  return { ...state, saveSettings, clearKey };
}
