import * as vscode from 'vscode';
import {
  LEGACY_AI_MODE_MIGRATION_NOTICE,
  normalizeExtensionAiMode,
  shouldMigrateStoredAiMode,
} from './aiModeNormalization';

const GLOBAL_AI_MODE_MIGRATION_KEY = 'gitcat.ai.modeMigration.global.removeMockDefaultLocal.v1';
const WORKSPACE_AI_MODE_MIGRATION_KEY = 'gitcat.ai.modeMigration.workspace.removeMockDefaultLocal.v1';
export {
  LEGACY_AI_MODE_MIGRATION_NOTICE,
  LEGACY_MOCK_MODE_WARNING,
  normalizeExtensionAiMode,
  shouldMigrateStoredAiMode,
  type NormalizedExtensionAiMode,
  type SupportedExtensionAiMode,
} from './aiModeNormalization';

export async function migrateLegacyAiModeSettingIfNeeded(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('gitcat.ai');
  const inspected = config.inspect<string>('mode');
  const rawMode = inspected?.workspaceFolderValue
    ?? inspected?.workspaceValue
    ?? inspected?.globalValue;

  if (!shouldMigrateStoredAiMode(rawMode)) {
    return undefined;
  }

  const target = inspected?.workspaceFolderValue !== undefined
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : inspected?.workspaceValue !== undefined
      ? vscode.ConfigurationTarget.Workspace
      : inspected?.globalValue !== undefined
        ? vscode.ConfigurationTarget.Global
        : undefined;

  if (!target) {
    return undefined;
  }

  const migrationState = target === vscode.ConfigurationTarget.Global
    ? context.globalState
    : context.workspaceState;
  const migrationKey = target === vscode.ConfigurationTarget.Global
    ? GLOBAL_AI_MODE_MIGRATION_KEY
    : WORKSPACE_AI_MODE_MIGRATION_KEY;

  if (migrationState.get<boolean>(migrationKey) === true) {
    return undefined;
  }

  await config.update('mode', 'live-local', target);
  await migrationState.update(migrationKey, true);
  return LEGACY_AI_MODE_MIGRATION_NOTICE;
}
