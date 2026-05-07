import { create } from 'zustand';
import { Snapshot, ConflictAnalysis, AIDraft, Branch, OutboundMessage, GitStatusSummary } from '@gitcat/shared-types';

/** 전역 알림 메시지 타입 */
export interface GlobalNotification {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

/** Merge 결과 상태 타입 */
export interface MergeResult {
  /** 머지 성공 여부 */
  success: boolean;
  /** 충돌 발생 시 파일 목록 */
  conflictedFiles?: string[];
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
  isRefreshingStatus: boolean;
  lastStatusRefreshAt: number | null;

  // Phase 2 New Data
  branches: Branch[];
  aiCommitSuggestion: string;
  expandedSections: string[];
  expandedSnapshotId: string | null;

  // 전역 알림 (백엔드 ERROR / NOTIFICATION / GIT_OPERATION_RESULT 수신 시 설정)
  globalNotification: GlobalNotification | null;

  // Merge 결과 (MERGE_COMPLETE 수신 시 설정, 충돌 시 ERROR에서 파싱)
  mergeResult: MergeResult | null;

  // Git 상태 요약 (GET_GIT_STATUS_SUMMARY 요청 후 GIT_STATUS_SUMMARY 수신 시 갱신)
  statusSummary: GitStatusSummary | null;

  // AI PR 설명 추천 결과 (PR_SUGGESTION 수신 시 갱신)
  prSuggestion: string | null;
  isPrLoading: boolean;

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
  clearMergeResult: () => void;
  clearPrSuggestion: () => void;

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
  mergeResult: null,
  statusSummary: null,
  prSuggestion: null,
  isPrLoading: false,
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
  clearMergeResult: () => set({ mergeResult: null }),
  clearPrSuggestion: () => set({ prSuggestion: null }),

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
        if (payload.target === 'RECOMMEND_PR') {
          set({ isPrLoading: payload.loading });
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

      case 'GIT_STATUS_SUMMARY':
        set({ statusSummary: payload.summary });
        break;

      case 'PR_SUGGESTION':
        set({ prSuggestion: payload.markdown, isPrLoading: false });
        break;

      case 'PR_CREATED':
        set({
          globalNotification: {
            type: 'success',
            message: `PR #${payload.prNumber} 생성 완료: ${payload.htmlUrl}`,
          },
        });
        break;

      // ── 백엔드 에러 / 알림 수신 처리 ──

      case 'MERGE_COMPLETE':
        // 머지 성공 — MERGE_COMPLETE는 payload가 {} 이므로 성공 상태로 저장
        set({ mergeResult: { success: true } });
        break;

      case 'ERROR': {
        // 병합 충돌 에러인 경우 → mergeResult에 충돌 파일 목록을 파싱하여 저장
        const isMergeConflict = payload.message?.startsWith('병합 충돌이 발생했습니다:');
        if (isMergeConflict) {
          const filesStr = payload.message.replace('병합 충돌이 발생했습니다:', '').trim();
          const conflictedFiles = filesStr ? filesStr.split(', ').map((f: string) => f.trim()).filter(Boolean) : [];
          set({ mergeResult: { success: false, conflictedFiles } });
        } else {
          // 일반 에러는 기존 globalNotification으로 처리
          set({ globalNotification: { type: 'error', message: payload.message } });
        }
        break;
      }

      case 'NOTIFICATION':
        // 백엔드에서 명시적으로 보내는 info/warning/error 알림
        set({ globalNotification: { type: payload.type, message: payload.message } });
        break;

      case 'GIT_OPERATION_RESULT':
        // git add / push / merge / checkout 등 git 명령 실행 결과
        // RUN_MERGE 실패는 mergeResult 배너에서 처리하므로 중복 표시 방지
        if (!payload.result.success && payload.operation !== 'RUN_MERGE') {
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
