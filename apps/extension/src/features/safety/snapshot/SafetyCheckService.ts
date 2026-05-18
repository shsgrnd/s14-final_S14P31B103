import * as path from 'path';
import * as vscode from 'vscode';
import type { SafetyWarning, SnapshotFile } from '@gitcat/shared-types';

const DEFAULT_LARGE_DELETION_THRESHOLD = 50;

type WarningSeverity = SafetyWarning['severity'];
type WarningType = SafetyWarning['type'];

interface WarningSeed {
  type: WarningType;
  code: string;
  message: string;
  severity: WarningSeverity;
  filePaths?: string[];
  blocking?: boolean;
  metadata?: Record<string, unknown>;
}

interface AnalyzeChangedFilesParams {
  changedFiles: SnapshotFile[];
  deletedFiles?: string[];
}

interface AnalyzeRestorePlanParams {
  phase: 'before_restore' | 'after_restore';
  changedFiles?: SnapshotFile[];
  fileStates: Iterable<{
    filePath: string;
    content: Uint8Array | null;
  }>;
}

export class SafetyCheckService {
  private readonly workspaceRoot: string;

  constructor(
    workspaceRoot: string,
    private readonly largeDeletionThreshold = SafetyCheckService.readLargeDeletionThreshold(),
  ) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  analyzeSnapshot(params: AnalyzeChangedFilesParams): SafetyWarning[] {
    const warnings = this.buildLargeDeletionWarnings(params.changedFiles);

    for (const file of params.changedFiles) {
      warnings.push(...this.buildRiskWarningsForPath(file.filePath, file.status));
      if (file.renamedFrom) {
        warnings.push(...this.buildRiskWarningsForPath(file.renamedFrom, 'deleted'));
      }
    }

    return this.dedupeWarnings(warnings);
  }

  analyzeRestorePlan(params: AnalyzeRestorePlanParams): SafetyWarning[] {
    const warnings: SafetyWarning[] = [];

    for (const state of params.fileStates) {
      const normalizedPath = this.normalizeRelativePath(state.filePath);
      warnings.push(
        ...this.buildRiskWarningsForPath(
          normalizedPath,
          state.content === null ? 'deleted' : 'modified',
          params.phase,
        ),
      );
    }

    warnings.push(...this.buildLargeDeletionWarnings(params.changedFiles ?? []));
    return this.dedupeWarnings(warnings);
  }

  assertNoBlockedDeletion(filePath: string, nextContent: Uint8Array | null): void {
    const normalizedPath = this.normalizeRelativePath(filePath);
    if (nextContent !== null) {
      return;
    }

    if (normalizedPath === '.git' || normalizedPath.startsWith('.git/')) {
      throw new Error(`Blocked unsafe restore target: ${normalizedPath}`);
    }
  }

  static readLargeDeletionThreshold(): number {
    const value = vscode.workspace
      .getConfiguration('gitcat.safety')
      .get<number>('largeDeletionThreshold', DEFAULT_LARGE_DELETION_THRESHOLD);

    if (!Number.isFinite(value) || value < 1) {
      return DEFAULT_LARGE_DELETION_THRESHOLD;
    }

    return Math.floor(value);
  }

  private buildLargeDeletionWarnings(changedFiles: SnapshotFile[]): SafetyWarning[] {
    const deletedLineCount = changedFiles.reduce(
      (total, file) => total + Math.max(0, file.deletions ?? 0),
      0,
    );
    if (deletedLineCount < this.largeDeletionThreshold) {
      return [];
    }

    const affectedPaths = changedFiles
      .filter((file) => (file.deletions ?? 0) > 0 || file.status === 'deleted')
      .map((file) => this.normalizeRelativePath(file.filePath));
    const severity: WarningSeverity =
      deletedLineCount >= this.largeDeletionThreshold * 2 ? 'high' : 'medium';

    return [
      this.createWarning({
        type: 'large_deletion',
        code: 'large_line_deletion',
        message: `${deletedLineCount} lines are scheduled for deletion.`,
        severity,
        filePaths: affectedPaths,
        metadata: {
          threshold: this.largeDeletionThreshold,
          deletedLineCount,
          affectedFileCount: affectedPaths.length,
        },
      }),
    ];
  }

  private buildRiskWarningsForPath(
    filePath: string,
    status: SnapshotFile['status'],
    phase: 'snapshot' | 'before_restore' | 'after_restore' = 'snapshot',
  ): SafetyWarning[] {
    const normalizedPath = this.normalizeRelativePath(filePath);
    const seeds: WarningSeed[] = [];

    if (normalizedPath === '.git' || normalizedPath.startsWith('.git/')) {
      seeds.push({
        type: status === 'deleted' ? 'blocked_operation' : 'sensitive_file_change',
        code: status === 'deleted' ? 'git_directory_delete_blocked' : 'git_metadata_changed',
        message:
          status === 'deleted'
            ? `Deletion of ${normalizedPath} is blocked for safety.`
            : `.git metadata changed: ${normalizedPath}`,
        severity: 'critical',
        filePaths: [normalizedPath],
        blocking: status === 'deleted',
        metadata: { phase, category: 'git' },
      });
    }

    if (this.isEnvPath(normalizedPath)) {
      seeds.push({
        type: 'sensitive_file_change',
        code: 'env_file_changed',
        message: `Environment file changed: ${normalizedPath}`,
        severity: 'high',
        filePaths: [normalizedPath],
        metadata: { phase, category: 'env' },
      });
    }

    if (this.isMigrationPath(normalizedPath)) {
      seeds.push({
        type: 'sensitive_file_change',
        code: 'migration_file_changed',
        message: `Migration-related file changed: ${normalizedPath}`,
        severity: 'high',
        filePaths: [normalizedPath],
        metadata: { phase, category: 'migration' },
      });
    }

    if (this.isPackageManagerPath(normalizedPath)) {
      seeds.push({
        type: 'sensitive_file_change',
        code: 'package_manager_file_changed',
        message: `Dependency or package manifest changed: ${normalizedPath}`,
        severity: 'high',
        filePaths: [normalizedPath],
        metadata: { phase, category: 'package' },
      });
    }

    if (this.isTypeScriptConfigPath(normalizedPath)) {
      seeds.push({
        type: 'sensitive_file_change',
        code: 'typescript_config_changed',
        message: `TypeScript configuration changed: ${normalizedPath}`,
        severity: 'medium',
        filePaths: [normalizedPath],
        metadata: { phase, category: 'typescript' },
      });
    }

    if (this.isWorkspaceConfigPath(normalizedPath)) {
      seeds.push({
        type: 'sensitive_file_change',
        code: 'workspace_config_changed',
        message: `Workspace or editor configuration changed: ${normalizedPath}`,
        severity: 'medium',
        filePaths: [normalizedPath],
        metadata: { phase, category: 'workspace_config' },
      });
    }

    if (this.isProjectConfigPath(normalizedPath)) {
      seeds.push({
        type: 'sensitive_file_change',
        code: 'project_config_changed',
        message: `Project configuration changed: ${normalizedPath}`,
        severity: 'medium',
        filePaths: [normalizedPath],
        metadata: { phase, category: 'project_config' },
      });
    }

    return seeds.map((seed) => this.createWarning(seed));
  }

  private createWarning(seed: WarningSeed): SafetyWarning {
    const primaryPath = seed.filePaths?.[0] ?? seed.code;
    return {
      warningId: `${seed.code}:${primaryPath}`,
      type: seed.type,
      code: seed.code,
      message: seed.message,
      filePaths: seed.filePaths,
      severity: seed.severity,
      blocking: seed.blocking ?? false,
      metadata: seed.metadata,
    };
  }

  private dedupeWarnings(warnings: SafetyWarning[]): SafetyWarning[] {
    const deduped = new Map<string, SafetyWarning>();
    for (const warning of warnings) {
      deduped.set(warning.warningId, warning);
    }
    return [...deduped.values()];
  }

  private normalizeRelativePath(filePath: string): string {
    const absolutePath = path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : path.resolve(this.workspaceRoot, filePath);
    const relativePath = path.relative(this.workspaceRoot, absolutePath);
    return relativePath.replace(/\\/g, '/');
  }

  private isEnvPath(filePath: string): boolean {
    const baseName = path.posix.basename(filePath);
    return baseName === '.env' || baseName.startsWith('.env.');
  }

  private isMigrationPath(filePath: string): boolean {
    const normalized = filePath.toLowerCase();
    return (
      normalized.includes('/migrations/') ||
      normalized.includes('/migration/') ||
      normalized.endsWith('.sql')
    );
  }

  private isPackageManagerPath(filePath: string): boolean {
    const baseName = path.posix.basename(filePath);
    return [
      'package.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'bun.lockb',
      'bun.lock',
    ].includes(baseName);
  }

  private isTypeScriptConfigPath(filePath: string): boolean {
    const baseName = path.posix.basename(filePath);
    return baseName === 'tsconfig.json' || baseName.startsWith('tsconfig.');
  }

  private isWorkspaceConfigPath(filePath: string): boolean {
    return filePath.startsWith('.vscode/') || filePath.startsWith('.idea/');
  }

  private isProjectConfigPath(filePath: string): boolean {
    const baseName = path.posix.basename(filePath);
    return [
      '.gitignore',
      '.gitattributes',
      '.editorconfig',
      '.npmrc',
      '.nvmrc',
      'docker-compose.yml',
      'docker-compose.yaml',
      'Dockerfile',
      'eslint.config.js',
      'eslint.config.mjs',
      '.eslintrc',
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.prettierrc',
      '.prettierrc.js',
      'vitest.config.ts',
      'vite.config.ts',
      'jest.config.ts',
    ].includes(baseName) || filePath.includes('/config/');
  }
}
