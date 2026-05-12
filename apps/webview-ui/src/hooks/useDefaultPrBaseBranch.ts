import { useCallback } from 'react';
import { useGitCatStore } from '../store/useGitCatStore';
import { sendMessage } from './useVsCodeApi';

/**
 * PR 기본 target 브랜치 환경설정을 다루는 훅.
 *
 * 값은 Extension Host의 `workspaceState`에 저장되며, 모든 webview가 동일한 값을
 * 공유한다(분리된 webview 간 공유 가능). 사이드바 webview와 PR Create panel webview가
 * 서로 다른 acquireVsCodeApi() 인스턴스를 가지기 때문에, webview state로는 공유되지
 * 않는다는 점에 유의.
 *
 * - `defaultBranch`:
 *     · `undefined` — 초기 응답 도착 전(아직 GET 메시지에 대한 결과를 못 받음)
 *     · `null`      — 저장된 값 없음(자동 추론 모드)
 *     · `string`    — 저장된 브랜치 이름
 * - 변경/삭제 시 extension이 모든 webview에 broadcast 하므로, store가 자동 갱신된다.
 */
export function useDefaultPrBaseBranch() {
  const defaultBranch = useGitCatStore((s) => s.prDefaultBaseBranch);

  const setDefaultBranch = useCallback((name: string) => {
    sendMessage('SET_PR_DEFAULT_BASE_BRANCH', { branch: name });
  }, []);

  const clearDefaultBranch = useCallback(() => {
    sendMessage('CLEAR_PR_DEFAULT_BASE_BRANCH', {});
  }, []);

  return { defaultBranch, setDefaultBranch, clearDefaultBranch };
}
