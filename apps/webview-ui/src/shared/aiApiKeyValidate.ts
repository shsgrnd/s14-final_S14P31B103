/**
 * 웹뷰 AI 키 입력 검증. 형식만 보며 실제 API 유효성은 호스트에서 검증한다.
 * @returns 오류 메시지 또는 통과 시 null
 */
export function validateAiApiKeyInput(raw: string): string | null {
  const t = raw.trim();
  if (!t) return '키를 입력해 주세요.';
  if (t.length < 8) return '키가 너무 짧습니다. 복사·붙여넣기가 올바른지 확인해 주세요.';
  if (t.length > 512) return '키가 너무 깁니다.';
  if (/[\r\n]/.test(t)) return '키에 줄바꿈이 들어가 있습니다.';
  return null;
}

export function validateAiRemoteBaseUrlInput(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Remote Base URL을 입력해 주세요.';

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Remote Base URL은 http 또는 https URL이어야 합니다.';
    }
  } catch {
    return 'Remote Base URL 형식이 올바르지 않습니다.';
  }

  return null;
}

export function validateAiRemoteModelInput(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Remote Model을 입력해 주세요.';
  if (value.length > 200) return 'Remote Model 값이 너무 깁니다.';
  if (/[\r\n]/.test(value)) return 'Remote Model에 줄바꿈이 들어가 있습니다.';
  return null;
}
