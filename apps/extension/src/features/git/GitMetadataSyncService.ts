import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import {
  SqliteBranchRepository,
  SqliteWorktreeRepository,
} from '@gitcat/storage';
import type { BranchInfo, WorktreeInfo } from '@gitcat/git-core';

interface MetadataContext {
  projectId: string;
  deviceId: string;
  workspaceRoot: string;
}

export class GitMetadataSyncService {
  private readonly branchRepository: SqliteBranchRepository;
  private readonly worktreeRepository: SqliteWorktreeRepository;
  private readonly context: MetadataContext;

  constructor(
    private readonly db: any,
    workspaceRoot: string,
  ) {
    this.branchRepository = new SqliteBranchRepository(db as any);
    this.worktreeRepository = new SqliteWorktreeRepository(db as any);
    this.context = {
      projectId: `project_${hash(workspaceRoot)}`,
      deviceId: `device_${hash(os.hostname())}`,
      workspaceRoot,
    };
    this.ensureBaseMetadata();
  }

  async syncBranches(branches: BranchInfo[]): Promise<void> {
    this.ensureBaseMetadata();

    for (const branch of branches) {
      await this.branchRepository.upsert({
        branch_id: this.branchId(branch.name),
        project_id: this.context.projectId,
        branch_name: branch.name,
        is_remote: branch.isRemote ? 1 : 0,
        tracking_branch_name: branch.trackingBranch ?? null,
        last_commit_hash: branch.lastCommitHash ?? null,
      });
    }
  }

  async deleteBranch(branchName: string): Promise<void> {
    await this.branchRepository.deleteByProjectAndName(this.context.projectId, branchName);
  }

  async syncWorktrees(worktrees: WorktreeInfo[]): Promise<void> {
    this.ensureBaseMetadata();

    for (const worktree of worktrees) {
      const worktreeId = this.worktreeId(worktree.path);
      await this.worktreeRepository.upsert({
        worktree_id: worktreeId,
        project_id: this.context.projectId,
        worktree_path: worktree.path,
        is_main: worktree.isMain ? 1 : 0,
        is_active: worktree.isLocked ? 0 : 1,
        last_opened_at: new Date().toISOString(),
      });

      if (!worktree.branch || worktree.branch === '(detached)') {
        continue;
      }

      const branchId = this.branchId(worktree.branch);
      await this.branchRepository.upsert({
        branch_id: branchId,
        project_id: this.context.projectId,
        branch_name: worktree.branch,
        is_remote: 0,
        tracking_branch_name: null,
        last_commit_hash: worktree.head ?? null,
      });
      this.upsertWorktreeInstance(worktreeId, branchId);
    }
  }

  private ensureBaseMetadata(): void {
    const now = new Date().toISOString();
    const projectName = path.basename(this.context.workspaceRoot) || 'workspace';

    this.db.prepare(`
      INSERT INTO users (user_id, email, name, created_at, updated_at)
      VALUES (?, NULL, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at
    `).run('local_user', os.userInfo().username || 'local', now, now);

    this.db.prepare(`
      INSERT INTO devices (device_id, user_id, device_name, device_type, os_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        device_name = excluded.device_name,
        os_type = excluded.os_type,
        updated_at = excluded.updated_at
    `).run(this.context.deviceId, 'local_user', os.hostname(), 'desktop', os.platform(), now, now);

    this.db.prepare(`
      INSERT INTO projects (project_id, user_id, project_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        project_name = excluded.project_name,
        updated_at = excluded.updated_at
    `).run(this.context.projectId, 'local_user', projectName, now, now);

    this.db.prepare(`
      INSERT INTO project_workspaces (
        project_workspace_id, device_id, project_id, workspace_root_path, git_root_path, last_opened_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_workspace_id) DO UPDATE SET
        workspace_root_path = excluded.workspace_root_path,
        git_root_path = excluded.git_root_path,
        last_opened_at = excluded.last_opened_at,
        updated_at = excluded.updated_at
    `).run(
      `workspace_${hash(this.context.workspaceRoot)}`,
      this.context.deviceId,
      this.context.projectId,
      this.context.workspaceRoot,
      this.context.workspaceRoot,
      now,
      now,
      now,
    );
  }

  private upsertWorktreeInstance(worktreeId: string, branchId: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO worktree_instances (worktree_instance_id, worktree_id, branch_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(worktree_instance_id) DO UPDATE SET
        worktree_id = excluded.worktree_id,
        branch_id = excluded.branch_id,
        updated_at = excluded.updated_at
    `).run(`worktree_instance_${hash(`${worktreeId}:${branchId}`)}`, worktreeId, branchId, now, now);
  }

  private branchId(branchName: string): string {
    return `branch_${hash(`${this.context.projectId}:${branchName}`)}`;
  }

  private worktreeId(worktreePath: string): string {
    return `worktree_${hash(`${this.context.projectId}:${worktreePath}`)}`;
  }
}

function hash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}
