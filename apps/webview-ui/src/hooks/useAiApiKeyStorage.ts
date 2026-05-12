import { useCallback, useEffect, useState } from 'react';
import { sendMessage } from './useVsCodeApi';

/**
 * AI 키 저장 여부를 React와 동기화한다. (Extension의 SecretStorage 연동)
 */
export function useAiApiKeyStorage() {
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg && msg.type === 'AI_API_KEY_STATUS' && msg.payload) {
        setHasKey(msg.payload.hasKey);
      }
    };
    window.addEventListener('message', handleMessage);
    
    // 초기 마운트 시 키 상태 요청
    sendMessage('CHECK_AI_API_KEY', {});

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const saveKey = useCallback((raw: string) => {
    sendMessage('SAVE_AI_API_KEY', { apiKey: raw });
  }, []);

  const clearKey = useCallback(() => {
    sendMessage('DELETE_AI_API_KEY', {});
  }, []);

  return { hasKey, saveKey, clearKey };
}
