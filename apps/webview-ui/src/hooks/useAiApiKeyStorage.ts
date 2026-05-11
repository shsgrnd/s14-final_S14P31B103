import { useCallback, useMemo, useState } from 'react';
import { clearStoredAiApiKey, hasStoredAiApiKey, writeStoredAiApiKey } from '../lib/aiApiKeyWebviewStorage';

/**
 * AI 키 저장 여부를 React와 동기화한다. (저장소 구현은 aiApiKeyWebviewStorage 참고)
 */
export function useAiApiKeyStorage() {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const hasKey = useMemo(() => {
    void version;
    return hasStoredAiApiKey();
  }, [version]);

  const saveKey = useCallback(
    (raw: string) => {
      writeStoredAiApiKey(raw);
      bump();
    },
    [bump],
  );

  const clearKey = useCallback(() => {
    clearStoredAiApiKey();
    bump();
  }, [bump]);

  return { hasKey, saveKey, clearKey };
}
