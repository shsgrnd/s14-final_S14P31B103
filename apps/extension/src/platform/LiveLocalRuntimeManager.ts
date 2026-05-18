import * as vscode from 'vscode';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const NODE_LLAMA_CPP_VERSION = '3.18.1';
const RUNTIME_PACKAGE_NAME = 'node-llama-cpp';
const RUNTIME_PACKAGE_SPEC = `${RUNTIME_PACKAGE_NAME}@${NODE_LLAMA_CPP_VERSION}`;
const RUNTIME_WORKSPACE_NAME = 'gitcat-live-local-runtime';

export class LiveLocalRuntimeManager {
  private hasPromptedMissingRuntime = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public getRuntimeRoot(): string {
    return path.join(this.context.globalStorageUri.fsPath, 'live-local-runtime');
  }

  public getRuntimeEntryPath(): string {
    return path.join(
      this.getRuntimeRoot(),
      'node_modules',
      RUNTIME_PACKAGE_NAME,
      'dist',
      'index.js',
    );
  }

  public async isRuntimeInstalled(): Promise<boolean> {
    try {
      await fs.access(this.getRuntimeEntryPath());
      return true;
    } catch {
      return false;
    }
  }

  public async promptIfLiveLocalNeedsSetup(): Promise<void> {
    if (this.context.extensionMode !== vscode.ExtensionMode.Production) {
      return;
    }

    const config = vscode.workspace.getConfiguration('gitcat.ai');
    if (config.get<string>('mode') !== 'live-local') {
      return;
    }

    const localModelPath = config.get<string>('localModelPath')?.trim();
    if (!localModelPath) {
      void vscode.window.showWarningMessage(
        'GitCat live-local 모드는 GGUF 모델 경로가 필요합니다. `Gitcat > Ai: Local Model Path`를 먼저 설정해 주세요.'
      );
    }

    if (this.hasPromptedMissingRuntime || await this.isRuntimeInstalled()) {
      return;
    }

    this.hasPromptedMissingRuntime = true;
    const action = await vscode.window.showWarningMessage(
      'GitCat live-local 런타임이 아직 설치되지 않았습니다. Command Palette에서 `GitCat: Install Local Runtime`을 실행하거나 아래 버튼으로 설치를 시작해 주세요.',
      'Install Runtime',
    );

    if (action === 'Install Runtime') {
      await this.startInstallFlow();
    }
  }

  public async startInstallFlow(): Promise<void> {
    const runtimeRoot = this.getRuntimeRoot();
    await fs.mkdir(runtimeRoot, { recursive: true });
    await fs.writeFile(
      path.join(runtimeRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: RUNTIME_WORKSPACE_NAME,
          private: true,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const terminal = vscode.window.createTerminal({
      name: 'GitCat live-local runtime',
      cwd: runtimeRoot,
    });
    terminal.show(true);
    terminal.sendText(`npm install --omit=dev --no-save ${RUNTIME_PACKAGE_SPEC}`, true);

    void vscode.window.showInformationMessage(
      'GitCat live-local runtime 설치 명령을 터미널에서 시작했습니다. 설치가 끝난 뒤 AI 기능을 다시 실행해 주세요.'
    );
  }
}
