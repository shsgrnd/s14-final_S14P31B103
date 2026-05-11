import { getVsCodeWebviewApi } from '../hooks/useVsCodeApi';

/**
 * AI API 키 — 웹뷰에서만 접근 가능한 저장소.
 *
 * VS Code 웹뷰 API의 setState/getState(패널 단위 직렬화)와, 브라우저 개발 시 sessionStorage를 사용한다.
 * Extension Host의 SecretStorage(예: GitHubTokenProvider)와는 연결되어 있지 않으며,
 * 저장된 값은 AI 추천 등 호스트 측 파이프라인에서 자동으로 읽히지 않는다.
 *
 * ── Backend / AI PR에서 이어질 작업(참고만, 타입/메시지는 PR에서 확정) ──
 * - packages/storage `SecretManager` + `context.secrets` (`gitcat:secret:aiApiKey`)
 * - Webview → Extension 인바운드 메시지로 키 저장·삭제·메타만 조회 (평문 로그 금지)
 * - `MergeAiService` 생성 시 `new AiClient({ apiKey, baseURL, mode: 'live' })` 등으로 주입
 * - shared-types `InboundMessageSchema` / MessageRouter 분기 / docs CSV 동기화
 */
const STATE_KEY = 'gitcatAiApiKey';
const SESSION_FALLBACK_KEY = 'gitcat.session.aiApiKey';

function readFromSession(): string | undefined {
  try {
    const v = sessionStorage.getItem(SESSION_FALLBACK_KEY);
    return v && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

function writeToSession(value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(SESSION_FALLBACK_KEY);
    else sessionStorage.setItem(SESSION_FALLBACK_KEY, value);
  } catch {
    /* ignore */
  }
}

function readFromVsCodeState(): string | undefined {
  const api = getVsCodeWebviewApi();
  if (!api) return undefined;
  const raw = api.getState() as Record<string, unknown> | undefined;
  const v = raw?.[STATE_KEY];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function writeToVsCodeState(value: string | null): void {
  const api = getVsCodeWebviewApi();
  if (!api) return;
  const prev = { ...((api.getState() as Record<string, unknown>) ?? {}) };
  if (value === null) delete prev[STATE_KEY];
  else prev[STATE_KEY] = value;
  api.setState(prev);
}

/** 저장된 키가 있으면 반환. 평문은 로깅·렌더링에 사용하지 말 것. */
export function readStoredAiApiKey(): string | undefined {
  return readFromVsCodeState() ?? readFromSession();
}

export function writeStoredAiApiKey(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  writeToVsCodeState(trimmed);
  writeToSession(trimmed);
}

export function clearStoredAiApiKey(): void {
  writeToVsCodeState(null);
  writeToSession(null);
}

export function hasStoredAiApiKey(): boolean {
  return Boolean(readStoredAiApiKey());
}
