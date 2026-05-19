import * as vscode from 'vscode';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { normalizeExtensionAiMode } from './aiModeConfig';
import { t } from '../i18n';

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
    const normalizedMode = normalizeExtensionAiMode(config.get<string>('mode'));
    if (normalizedMode.mode !== 'live-local') {
      return;
    }

    const localModelPath = config.get<string>('localModelPath')?.trim();
    if (!localModelPath) {
      void vscode.window.showWarningMessage(t('runtime.localModelPathRequired'));
    }

    if (this.hasPromptedMissingRuntime || await this.isRuntimeInstalled()) {
      return;
    }

    this.hasPromptedMissingRuntime = true;
    const action = await vscode.window.showWarningMessage(
      t('runtime.installPrompt'),
      t('runtime.installAction'),
    );

    if (action === t('runtime.installAction')) {
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

    void vscode.window.showInformationMessage(t('runtime.installStarted'));
  }
}
