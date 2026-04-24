/**
 * useVsCodeApi.ts
 * VS Code Webview API 연동 훅 (Mock Mode 적용 버전)
 */
import { useGitCatStore } from '../store/useGitCatStore';

interface WebviewApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): WebviewApi;

let vscodeApi: WebviewApi | undefined;

export const useVsCodeApi = () => {
  if (!vscodeApi && typeof acquireVsCodeApi === 'function') {
    vscodeApi = acquireVsCodeApi();
  }

  const sendMessage = <T>(command: string, payload?: T) => {
    if (vscodeApi) {
      vscodeApi.postMessage({ command, payload });
    } else {
      console.log(`[Message Sent (No VS Code API)]: ${command}`, payload);
    }
  };

  return { sendMessage, vscode: vscodeApi };
};
