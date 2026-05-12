/**
 * PrSettingsService — Webview 간 공유되는 PR 환경설정 저장소
 *
 * 사이드바 webview와 PR Create panel webview는 서로 다른 `acquireVsCodeApi()`
 * 인스턴스를 가지기 때문에 webview state(setState/getState)나 sessionStorage로는
 * 값이 공유되지 않는다. 이 서비스는 VS Code `context.workspaceState`에 값을 저장해
 * 모든 webview가 동일한 값을 읽을 수 있게 한다.
 *
 * 저장 항목:
 * - `defaultBaseBranch`: PR Create 패널을 열 때 자동으로 채워질 base 브랜치 이름.
 */
import type * as vscode from 'vscode';

const STORAGE_KEY = 'gitcat.pr.defaultBaseBranch';

export class PrSettingsService {
  constructor(private readonly workspaceState: vscode.Memento) {}

  getDefaultBaseBranch(): string | null {
    const value = this.workspaceState.get<string | undefined>(STORAGE_KEY);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  async setDefaultBaseBranch(branch: string): Promise<string | null> {
    const trimmed = branch.trim();
    if (!trimmed) {
      await this.workspaceState.update(STORAGE_KEY, undefined);
      return null;
    }
    await this.workspaceState.update(STORAGE_KEY, trimmed);
    return trimmed;
  }

  async clearDefaultBaseBranch(): Promise<void> {
    await this.workspaceState.update(STORAGE_KEY, undefined);
  }
}
