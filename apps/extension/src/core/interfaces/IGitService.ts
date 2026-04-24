import { BranchInfo, GitStatus } from '../types';

export interface IGitService {
    getStatus(repoPath?: string): Promise<GitStatus>;
    getBranches(repoPath?: string): Promise<BranchInfo[]>;
    runCommit(message: string, body?: string): Promise<void>;
    createBranch(name: string): Promise<void>;
    deleteBranch(name: string, force?: boolean): Promise<void>;
    // getStagedDiff, getDiff, getMergeBase 등 추가 예정
}
