import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import { GitService } from './GitService';
import {
  BranchCleanupSettings,
  BranchCleanupCandidate,
  BranchCleanupPreviewResult,
  BranchCleanupExecuteResult,
} from '@gitcat/shared-types';

const exec = util.promisify(cp.exec);

export interface BranchCleanupSummary {
  totalCandidates: number;
  deletableCount: number;
  skippedCount: number;
  protectedCount: number;
  currentBranchName: string | null;
  deletionReasonCounts: Record<string, number>;
  protectedBranchNames: string[];
}

export class BranchCleanupService {
  private readonly configKey = 'gitcat.branchCleanup';

  constructor(private readonly gitService: GitService) { }

  public getSettings(): BranchCleanupSettings {
    const config = vscode.workspace.getConfiguration(this.configKey);
    return {
      enabled: config.get<boolean>('enabled', false),
      olderThanValue: config.get<number>('olderThanValue', 2),
      olderThanUnit: config.get<string>('olderThanUnit', 'month') as 'week' | 'month',
      deleteMergedBranches: config.get<boolean>('deleteMergedBranches', true),
      deleteGoneRemoteBranches: config.get<boolean>('deleteGoneRemoteBranches', true),
      protectedBranches: config.get<string[]>('protectedBranches', ['main', 'master', 'develop', 'dev', 'release']),
    };
  }

  public async saveSettings(settings: BranchCleanupSettings): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.configKey);
    await config.update('enabled', settings.enabled, vscode.ConfigurationTarget.Workspace);
    await config.update('olderThanValue', settings.olderThanValue, vscode.ConfigurationTarget.Workspace);
    await config.update('olderThanUnit', settings.olderThanUnit, vscode.ConfigurationTarget.Workspace);
    await config.update('deleteMergedBranches', settings.deleteMergedBranches, vscode.ConfigurationTarget.Workspace);
    await config.update('deleteGoneRemoteBranches', settings.deleteGoneRemoteBranches, vscode.ConfigurationTarget.Workspace);
    await config.update('protectedBranches', settings.protectedBranches, vscode.ConfigurationTarget.Workspace);
  }

  public async fetchPrune(): Promise<void> {
    await this.gitService.fetchAllPrune();
  }

  public async getCandidates(): Promise<BranchCleanupPreviewResult> {
    const settings = this.getSettings();
    const branches = await this.gitService.getBranches();

    // 현재 체크아웃 중인 브랜치 찾기
    const currentBranch = branches.find((b) => b.isCurrent);
    const baseBranchName = currentBranch?.name ?? 'HEAD';

    // 원격에서 삭제된 브랜치 찾기
    const goneBranches = await this.getGoneBranches();

    const candidates: BranchCleanupCandidate[] = [];
    let deletableCount = 0;
    let skippedCount = 0;

    const thresholdDate = this.calculateThresholdDate(settings.olderThanValue, settings.olderThanUnit);

    for (const branch of branches) {
      if (branch.isRemote) continue; // 로컬 브랜치만 대상

      const isCurrent = branch.isCurrent;
      const isProtected = branch.status === 'protected';

      const commitDate = branch.lastActivity ? new Date(branch.lastActivity) : new Date();
      const isOlderThanThreshold = commitDate < thresholdDate;

      const isMerged = !!branch.isMerged;
      const isGoneRemote = goneBranches.includes(branch.name);

      const reasons: string[] = [];
      if (settings.deleteMergedBranches && isMerged) {
        reasons.push('Merged');
      }
      if (settings.deleteGoneRemoteBranches && isGoneRemote) {
        reasons.push('Gone remote');
      }
      if (isOlderThanThreshold) {
        reasons.push(`Older than ${settings.olderThanValue} ${settings.olderThanUnit}(s)`);
      }

      let skipReason: string | undefined;
      let shouldDelete = false;

      if (isCurrent) {
        skipReason = 'Current branch';
      } else if (isProtected) {
        skipReason = 'Protected branch';
      } else if (reasons.length === 0) {
        skipReason = 'Does not meet any cleanup criteria';
      } else {
        shouldDelete = true;
      }

      if (shouldDelete) {
        deletableCount++;
      } else {
        skippedCount++;
      }

      candidates.push({
        branchName: branch.name,
        isCurrent,
        isProtected,
        lastCommitDate: branch.lastActivity ?? '',
        isOlderThanThreshold,
        isMerged,
        isGoneRemote,
        shouldDelete,
        reasons,
        skipReason,
      });
    }

    return {
      settings,
      baseBranch: baseBranchName,
      candidates,
      deletableCount,
      skippedCount,
    };
  }

  public async getCandidateSummary(): Promise<BranchCleanupSummary> {
    const preview = await this.getCandidates();
    const deletionReasonCounts: Record<string, number> = {};
    const protectedBranchNames: string[] = [];
    let currentBranchName: string | null = null;
    let protectedCount = 0;

    for (const candidate of preview.candidates) {
      if (candidate.isCurrent) {
        currentBranchName = candidate.branchName;
      }

      if (candidate.isProtected) {
        protectedCount++;
        protectedBranchNames.push(candidate.branchName);
      }

      if (!candidate.shouldDelete) continue;

      for (const reason of candidate.reasons) {
        deletionReasonCounts[reason] = (deletionReasonCounts[reason] ?? 0) + 1;
      }
    }

    return {
      totalCandidates: preview.candidates.length,
      deletableCount: preview.deletableCount,
      skippedCount: preview.skippedCount,
      protectedCount,
      currentBranchName,
      deletionReasonCounts,
      protectedBranchNames,
    };
  }

  public async executeCleanup(branchNames: string[]): Promise<BranchCleanupExecuteResult> {
    const deletedBranches: string[] = [];
    const failedBranches: string[] = [];
    const skippedBranches: string[] = [];

    // 안전 삭제 로직: 현재/보호 브랜치는 항상 차단
    const candidatesResult = await this.getCandidates();
    const candidateMap = new Map(
      candidatesResult.candidates.map((c: BranchCleanupCandidate) => [c.branchName, c])
    );

    for (const name of branchNames) {
      const candidate = candidateMap.get(name);
      if (!candidate) {
        skippedBranches.push(`${name} (Branch not found in current local candidates)`);
        continue;
      }

      if (candidate.isCurrent) {
        skippedBranches.push(`${name} (Current branch)`);
        continue;
      }

      if (candidate.isProtected) {
        skippedBranches.push(`${name} (Protected branch)`);
        continue;
      }

      // 안전 삭제 우선 (force: false)
      const result = await this.gitService.deleteBranches([name], false);
      if (result.success) {
        deletedBranches.push(name);
      } else {
        failedBranches.push(`${name} (${result.message})`);
      }
    }

    return {
      deletedBranches,
      failedBranches,
      skippedBranches,
      summary: `Deleted ${deletedBranches.length}, Failed ${failedBranches.length}, Skipped ${skippedBranches.length}`,
    };
  }

  private async getGoneBranches(): Promise<string[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return [];

    const rootPath = workspaceFolders[0].uri.fsPath;
    try {
      // gone 상태인 브랜치 목록 가져오기
      const { stdout } = await exec('git for-each-ref --format="%(refname:short) %(upstream:track)" refs/heads', { cwd: rootPath });
      const lines = stdout.split('\n').filter(Boolean);

      const goneBranches: string[] = [];
      for (const line of lines) {
        const parts = line.trim().split(' ');
        if (parts.length >= 2 && parts.slice(1).join(' ').includes('[gone]')) {
          goneBranches.push(parts[0]);
        }
      }
      return goneBranches;
    } catch (err) {
      console.warn('[BranchCleanupService] Failed to get gone branches:', err);
      return [];
    }
  }

  private calculateThresholdDate(value: number, unit: 'week' | 'month'): Date {
    const date = new Date();
    if (unit === 'week') {
      date.setDate(date.getDate() - value * 7);
    } else if (unit === 'month') {
      date.setMonth(date.getMonth() - value);
    }
    return date;
  }
}
