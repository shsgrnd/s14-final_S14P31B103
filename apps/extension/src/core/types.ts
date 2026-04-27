/**
 * 공유 DTO 및 타입 정의
 * - Message Protocol 기반
 */

export interface IMessage {
    type: string;
    payload?: any;
}

export interface GitStatus {
    currentBranch: string;
    staged: string[];
    unstaged: string[];
    untracked: string[];
}

export interface BranchInfo {
    name: string;
    isRemote: boolean;
    isCurrent: boolean;
}

export interface SnapshotMeta {
    snapshotId: string;
    sessionId: string;
    reason: string;
    isCheckpoint: boolean;
    label: string;
    createdAt: string;
}
