import { InboundMessageType } from '@gitcat/shared-types';

interface WebviewApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): WebviewApi;

let vscodeApi: WebviewApi | undefined;

/**
 * 전역 vscodeApi 초기화 및 메시지 전송 함수
 */
export const sendMessage = <T>(type: InboundMessageType, payload?: T) => {
  if (!vscodeApi && typeof acquireVsCodeApi === 'function') {
    vscodeApi = acquireVsCodeApi();
  }

  if (vscodeApi) {
    // payload가 undefined인 경우 {} 를 fallback으로 전달합니다.
    // 백엔드 Zod 스키마가 payload를 required로 검증하므로
    // undefined 전송 시 "expected object, received undefined" 오류가 발생합니다.
    vscodeApi.postMessage({ type, payload: payload ?? {} });
  } else {
    // VS Code API 미연결 환경(브라우저 개발 모드): 메시지 전송 생략
  }
};

/**
 * VS Code Webview API를 직접 접근해야 할 경우 사용 (hook)
 */
export const useVsCodeApi = () => {
  return { sendMessage, vscode: vscodeApi };
};
