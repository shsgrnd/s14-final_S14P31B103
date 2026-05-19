import * as vscode from 'vscode';
import { normalizeExtensionAiMode, type SupportedExtensionAiMode } from '../../platform/aiModeConfig';

export interface AiRemoteSettingsState {
  aiMode: SupportedExtensionAiMode;
  remoteBaseUrl: string;
  remoteModel: string;
}

export interface SaveAiRemoteSettingsInput {
  remoteBaseUrl?: string;
  remoteModel?: string;
}

export class AiRemoteSettingsService {
  private readonly configSection = 'gitcat.ai';

  getState(): AiRemoteSettingsState {
    const config = vscode.workspace.getConfiguration(this.configSection);
    const aiMode = normalizeExtensionAiMode(config.get<string>('mode')).mode;

    return {
      aiMode,
      remoteBaseUrl: this.normalizeValue(config.get<string>('remoteBaseUrl')),
      remoteModel: this.normalizeValue(config.get<string>('remoteModel')),
    };
  }

  async saveSettings(input: SaveAiRemoteSettingsInput): Promise<AiRemoteSettingsState> {
    const config = vscode.workspace.getConfiguration(this.configSection);
    const target = this.resolveTarget();

    if (input.remoteBaseUrl !== undefined) {
      await config.update('remoteBaseUrl', input.remoteBaseUrl.trim(), target);
    }
    if (input.remoteModel !== undefined) {
      await config.update('remoteModel', input.remoteModel.trim(), target);
    }

    return this.getState();
  }

  private normalizeValue(value: string | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private resolveTarget(): vscode.ConfigurationTarget {
    return vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  }
}
