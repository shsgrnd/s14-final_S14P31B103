import { create } from 'zustand';
import { Snapshot, ConflictAnalysis, AIDraft, Branch, OutboundMessage } from '@gitcat/shared-types';

/** 전역 알림 메시지 타입 */
export interface GlobalNotification {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

/** Stash 항목 타입 (STASH_LIST payload에서 수신) */
export interface StashEntry {
  index: number;
  ref: string;
  message: string;
  branch: string;
  date: string;
}

interface GitCatState {
  // Data
  snapshots: Snapshot[];
  conflicts: ConflictAnalysis[];
  currentAIDraft: AIDraft | null;
  currentBranch: string;
  isAnalyzing: boolean;

  // Phase 2 New Data
  branches: Branch[];
  aiCommitSuggestion: string;
  expandedSections: string[];
  expandedSnapshotId: string | null;

  // Refresh status
  isRefreshingStatus: boolean;
  lastStatusRefreshAt: number | null;

  // 전역 알림 (백엔드 ERROR / NOTIFICATION / GIT_OPERATION_RESULT 수신 시 설정)
  globalNotification: GlobalNotification | null;

  // Stash 목록 (STASH_LIST 수신 시 갱신)
  stashes: StashEntry[];

  // Actions
  setSnapshots: (snapshots: Snapshot[]) => void;
  setConflicts: (conflicts: ConflictAnalysis[]) => void;
  setAIDraft: (draft: AIDraft | null) => void;
  setCurrentBranch: (branch: string) => void;
  setAnalyzing: (isAnalyzing: boolean) => void;
  setRefreshingStatus: (isRefreshingStatus: boolean) => void;
  setBranches: (branches: Branch[]) => void;
  setAICommitSuggestion: (suggestion: string) => void;
  toggleSection: (sectionId: string) => void;
  setExpandedSnapshotId: (id: string | null) => void;
  clearGlobalNotification: () => void;
  setStashes: (stashes: StashEntry[]) => void;

  handleMessage: (event: MessageEvent<OutboundMessage>) => void;
}

export const useGitCatStore = create<GitCatState>((set) => ({
  snapshots: [],
  conflicts: [],
  currentAIDraft: null,
  currentBranch: '',
  isAnalyzing: false,
  isRefreshingStatus: false,
  lastStatusRefreshAt: null,
  branches: [],
  aiCommitSuggestion: '',
  expandedSections: ['safety', 'branch'],
  expandedSnapshotId: null,
  globalNotification: null,
  stashes: [],

  setSnapshots: (snapshots) => set({ snapshots }),
  setConflicts: (conflicts) => set({ conflicts }),
  setAIDraft: (currentAIDraft) => set({ currentAIDraft }),
  setCurrentBranch: (currentBranch) => set({ currentBranch }),
  setAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setRefreshingStatus: (isRefreshingStatus) => set({ isRefreshingStatus }),
  setBranches: (branches) => set({ branches }),
  setAICommitSuggestion: (aiCommitSuggestion) => set({ aiCommitSuggestion }),
  clearGlobalNotification: () => set({ globalNotification: null }),
  setStashes: (stashes) => set({ stashes }),

  toggleSection: (sectionId) => set((state) => ({
    expandedSections: state.expandedSections.includes(sectionId)
      ? state.expandedSections.filter(id => id !== sectionId)
      : [...state.expandedSections, sectionId]
  })),

  setExpandedSnapshotId: (id) => set((state) => ({
    expandedSnapshotId: state.expandedSnapshotId === id ? null : id
  })),

  handleMessage: (event) => {
    const { type, payload } = event.data;

    switch (type) {
      case 'SNAPSHOT_LIST':
        set({ snapshots: payload.snapshots });
        break;
      case 'BRANCH_LIST':
        set({ branches: payload.branches });
        break;
      case 'GIT_STATUS_UPDATED':
        set({
          currentBranch: payload.status.branch ?? (payload.status as any).currentBranch ?? 'HEAD',
          isRefreshingStatus: false,
          lastStatusRefreshAt: Date.now(),
        });
        break;
      case 'LOADING':
        if (payload.target === 'status') {
          set({ isRefreshingStatus: payload.loading });
        }
        break;
      case 'CONFLICT_RESULT':
        set({ conflicts: payload.candidates });
        break;
      case 'MERGE_PROPOSAL':
        if (payload.proposals && payload.proposals.length > 0) {
          set({ currentAIDraft: payload.proposals[0] });
        }
        break;
      case 'COMMIT_SUGGESTIONS':
        set({ aiCommitSuggestion: payload.suggestions.description });
        break;

      // ── 백엔드 에러 / 알림 수신 처리 ──

      case 'ERROR':
        // 백엔드 Zod 검증 실패, 서비스 오류 등 모든 에러
        set({ globalNotification: { type: 'error', message: payload.message } });
        break;

      case 'NOTIFICATION':
        // 백엔드에서 명시적으로 보내는 info/warning/error 알림
        set({ globalNotification: { type: payload.type, message: payload.message } });
        break;

      case 'GIT_OPERATION_RESULT':
        // git add / push / merge / checkout 등 git 명령 실행 결과
        if (!payload.result.success) {
          set({
            globalNotification: {
              type: 'error',
              message: payload.result.error ?? `'${payload.operation}' 작업이 실패했습니다.`,
            },
          });
        }
        break;

      case 'STASH_LIST':
        // git stash 목록 수신
        set({ stashes: payload.stashes });
        break;
    }
  },
}));
