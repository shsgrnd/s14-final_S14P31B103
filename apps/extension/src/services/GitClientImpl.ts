import { IGitService } from '../core/interfaces/IGitService';
import { BranchInfo, GitStatus } from '../core/types';

/**
 * Git CLI 래퍼
 */
export class GitClientImpl implements IGitService {

    async getStatus(repoPath?: string): Promise<GitStatus> {
        // child_process.exec('git status --porcelain')
        return {
            currentBranch: 'main',
            staged: [],
            unstaged: [],
            untracked: []
        };
    }

    async getBranches(repoPath?: string): Promise<BranchInfo[]> {
        //child_process.exec('git branch')
        return [];
    }

    async runCommit(message: string, body?: string): Promise<void> {
        // child_process.exec('git commit -m "..."')
    }

    async createBranch(name: string): Promise<void> {
        // child_process.exec('git checkout -b ...')
    }

    async deleteBranch(name: string, force?: boolean): Promise<void> {
        // TODO: child_process.exec('git branch -d ...')
    }
}
