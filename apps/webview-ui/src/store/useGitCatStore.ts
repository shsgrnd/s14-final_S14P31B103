import { create } from 'zustand';
import {
  Snapshot,
  ConflictAnalysis,
  AIDraft,
  Branch,
  WorktreeInfo,
  OutboundMessage,
  GitStatusSummary,
  BranchCleanupSettings,
  BranchCleanupPreviewResult,
  BranchCleanupExecuteResult,
} from '@gitcat/shared-types';
import { translateUserFacingGitMessage, type UiMessageTone } from '../shared/gitMessageKo';

/** 전역 알림 메시지 타입 */
export interface GlobalNotification {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

type NotificationSection = 'git' | 'files' | 'snapshots' | 'branchCleanup' | 'stash';

/** Git 액션 패널에서 잠금 해제 시 동기화할 작업 종류 (LOADING 타깃과 대응) */
export type GitPanelPendingOperation = 'add' | 'commit' | 'push' | 'pull' | 'merge';

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

/** Git 섹션 배너: 일반 info 알림은 성공 UI(초록)로, 안내형(PR 패널 등)만 파란 info 유지 */
function mapGitSectionBannerType(
  payloadType: 'info' | 'warning' | 'error',
  raw: string,
): GlobalNotification['type'] {
  if (payloadType === 'error') return 'error';
  if (payloadType === 'warning') return 'warning';
  if (raw.includes('PR 패널')) return 'info';
  return 'success';
}

interface GitCatState {
  // Data
  snapshots: Snapshot[];
  conflicts: ConflictAnalysis[];
  currentAIDraft: AIDraft | null;
  currentBranch: string;
  currentWorktreePath: string;
  isAnalyzing: boolean;
  isRefreshingStatus: boolean;
  isPulling: boolean;
  /** GIT_ADD_ALL / GIT_STAGE_* 등 stage 타깃 LOADING */
  isStaging: boolean;
  /** EXECUTE_COMMIT 등 commit 타깃 LOADING */
  isCommitting: boolean;
  /** GIT_PUSH 등 push 타깃 LOADING */
  isPushing: boolean;
  /** RUN_MERGE 등 merge 타깃 LOADING */
  isMerging: boolean;
  lastStatusRefreshAt: number | null;

  // Phase 2 New Data
  branches: Branch[];
  aiCommitSuggestion: string;
  expandedSections: string[];
  expandedSnapshotId: string | null;

  // 전역 알림 (백엔드 ERROR / NOTIFICATION / GIT_OPERATION_RESULT 수신 시 설정)
  globalNotification: GlobalNotification | null;
  sectionNotifications: Partial<Record<NotificationSection, GlobalNotification>>;

  // Merge 결과 (MERGE_COMPLETE 수신 시 설정, 충돌 시 ERROR에서 파싱)
  mergeResult: MergeResult | null;

  // Git 상태 요약 (GET_GIT_STATUS_SUMMARY 요청 후 GIT_STATUS_SUMMARY 수신 시 갱신)
  statusSummary: GitStatusSummary | null;

  // AI PR 설명 추천 결과 (PR_SUGGESTION 수신 시 갱신)
  prSuggestion: string | null;
  isPrLoading: boolean;
  aiBranchSuggestions: string[];
  isBranchRecommendationLoading: boolean;

  // 워크트리 목록 (WORKTREE_LIST 수신 시 갱신)
  worktrees: WorktreeInfo[];

  // Stash 목록 (STASH_LIST 수신 시 갱신)
  stashes: StashEntry[];

  // 브랜치 자동 정리 설정 (BRANCH_CLEANUP_SETTINGS 수신 시 갱신)
  cleanupSettings: BranchCleanupSettings | null;
  cleanupPreview: BranchCleanupPreviewResult | null;
  cleanupExecuteResult: BranchCleanupExecuteResult | null;

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
  clearSectionNotification: (section: NotificationSection) => void;
  /** Git & AI 패널 전용 알림 (예: 클라이언트 검증 메시지) */
  postGitSectionBanner: (notification: GlobalNotification) => void;
  /** 확장 LOADING false보다 먼저 완료 알림이 올 때 버튼 라벨(Pulling… 등)을 바로 되돌림 */
  clearGitPanelOperationLoading: (op: GitPanelPendingOperation) => void;
  setStashes: (stashes: StashEntry[]) => void;
  clearMergeResult: () => void;
  clearPrSuggestion: () => void;
  clearBranchSuggestions: () => void;

  handleMessage: (event: MessageEvent<OutboundMessage>) => void;
}

/** Grid 액션 완료 등 백엔드 NOTIFICATION 원문 매칭 */
function isPrimaryGitPanelCompletionNotification(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (s.includes('PR 패널')) return false;
  return (
    s.includes('모든 변경사항이 스테이징') ||
    /\d+\s+file\(s\)\s+staged\.?/i.test(s) ||
    s.includes('커밋이 완료') ||
    s.includes('Push가 완료') ||
    s.includes('Pull이 완료') ||
    s.includes('병합이 완료') ||
    s.includes('병합이 취소') ||
    s.includes('병합이 계속')
  );
}

const GIT_PANEL_OPERATION_FAILURE = ['GIT_ADD_ALL', 'EXECUTE_COMMIT', 'GIT_PUSH', 'EXECUTE_PULL', 'RUN_MERGE'] as const;

export const useGitCatStore = create<GitCatState>((set) => ({
  snapshots: [],
  conflicts: [],
  currentAIDraft: null,
  currentBranch: '',
  currentWorktreePath: '',
  isAnalyzing: false,
  isRefreshingStatus: false,
  isPulling: false,
  isStaging: false,
  isCommitting: false,
  isPushing: false,
  isMerging: false,
  lastStatusRefreshAt: null,
  branches: [],
  aiCommitSuggestion: '',
  expandedSections: ['safety', 'branch'],
  expandedSnapshotId: null,
  globalNotification: null,
  sectionNotifications: {},
  mergeResult: null,
  statusSummary: null,
  prSuggestion: null,
  isPrLoading: false,
  aiBranchSuggestions: [],
  isBranchRecommendationLoading: false,
  worktrees: [],
  stashes: [],
  cleanupSettings: null,
  cleanupPreview: null,
  cleanupExecuteResult: null,

  setSnapshots: (snapshots) => set({ snapshots }),
  setConflicts: (conflicts) => set({ conflicts }),
  setAIDraft: (currentAIDraft) => set({ currentAIDraft }),
  setCurrentBranch: (currentBranch) => set({ currentBranch }),
  setAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setRefreshingStatus: (isRefreshingStatus) => set({ isRefreshingStatus }),
  setBranches: (branches) => set({ branches }),
  setAICommitSuggestion: (aiCommitSuggestion) => set({ aiCommitSuggestion }),
  clearGlobalNotification: () => set({ globalNotification: null }),
  clearSectionNotification: (section) =>
    set((state) => {
      const next = { ...state.sectionNotifications };
      delete next[section];
      return { sectionNotifications: next };
    }),
  postGitSectionBanner: (notification) =>
    set((state) => ({
      sectionNotifications: {
        ...state.sectionNotifications,
        git: notification,
      },
    })),
  clearGitPanelOperationLoading: (op) =>
    set(() => {
      switch (op) {
        case 'add':
          return { isStaging: false };
        case 'commit':
          return { isCommitting: false };
        case 'push':
          return { isPushing: false };
        case 'pull':
          return { isPulling: false };
        case 'merge':
          return { isMerging: false };
        default:
          return {};
      }
    }),
  setStashes: (stashes) => set({ stashes }),
  clearMergeResult: () => set({ mergeResult: null }),
  clearPrSuggestion: () => set({ prSuggestion: null }),
  clearBranchSuggestions: () => set({ aiBranchSuggestions: [] }),

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
    const inferSection = (message: string | undefined): NotificationSection => {
      const m = (message ?? '').toLowerCase();
      if (/\d+\s+file\(s\)\s+staged/.test(m) || /\d+\s+file\(s\)\s+unstaged/.test(m) || m.includes('파일이 unstage')) {
        return 'files';
      }
      if (m.includes('stash')) {
        return 'stash';
      }
      if (m.includes('스냅샷') || m.includes('snapshot') || m.includes('체크포인트')) {
        return 'snapshots';
      }
      if (
        m.includes('branch cleanup') ||
        m.includes('브랜치 정리') ||
        m.includes('deleted ') && m.includes('failed ') && m.includes('skipped ')
      ) {
        return 'branchCleanup';
      }
      return 'git';
    };
    const toneFor = (t: any): UiMessageTone => (t === 'error' || t === 'warning' || t === 'info' || t === 'success') ? t : 'info';

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
          currentWorktreePath: payload.status.currentWorktreePath ?? '',
          isRefreshingStatus: false,
          lastStatusRefreshAt: Date.now(),
        });
        break;
      case 'LOADING':
        if (payload.target === 'status') {
          set({ isRefreshingStatus: payload.loading });
        }
        if (payload.target === 'pull') {
          set({ isPulling: payload.loading });
        }
        if (payload.target === 'stage') {
          set({ isStaging: payload.loading });
        }
        if (payload.target === 'commit') {
          set({ isCommitting: payload.loading });
        }
        if (payload.target === 'push') {
          set({ isPushing: payload.loading });
        }
        if (payload.target === 'merge') {
          set({ isMerging: payload.loading });
        }
        if (payload.target === 'RECOMMEND_PR') {
          set({ isPrLoading: payload.loading });
        }
        if (payload.target === 'branchRecommendation') {
          set({ isBranchRecommendationLoading: payload.loading });
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
      case 'BRANCH_SUGGESTIONS':
        set({ aiBranchSuggestions: payload.names });
        break;

      case 'GIT_STATUS_SUMMARY':
        set({ statusSummary: payload.summary });
        break;

      case 'PR_SUGGESTION':
        set({ prSuggestion: payload.markdown, isPrLoading: false });
        break;

      case 'PR_CREATED':
        set((state) => ({
          globalNotification: {
            type: 'success',
            message: `PR #${payload.prNumber} 생성 완료: ${payload.htmlUrl}`,
          },
          sectionNotifications: {
            ...state.sectionNotifications,
            git: {
              type: 'success',
              message: `PR #${payload.prNumber} 생성 완료: ${payload.htmlUrl}`,
            },
          },
        }));
        break;

      // ── 백엔드 에러 / 알림 수신 처리 ──

      case 'MERGE_COMPLETE':
        set({ mergeResult: null });
        break;

      case 'ERROR': {
        const rawMsg = payload.message ?? '';
        const isMergeConflict = rawMsg.startsWith('병합 충돌이 발생했습니다:');
        if (isMergeConflict) {
          const filesStr = rawMsg.replace('병합 충돌이 발생했습니다:', '').trim();
          const conflictedFiles = filesStr ? filesStr.split(', ').map((f: string) => f.trim()).filter(Boolean) : [];
          set((state) => ({
            mergeResult: { success: false, conflictedFiles },
            sectionNotifications: {
              ...state.sectionNotifications,
              git: {
                type: 'error',
                message: translateUserFacingGitMessage('병합 충돌이 발생했습니다.', 'error'),
              },
            },
          }));
          break;
        }
        const section = inferSection(rawMsg);
        const message = translateUserFacingGitMessage(rawMsg, 'error');
        if (section === 'git') {
          set((state) => ({
            sectionNotifications: {
              ...state.sectionNotifications,
              git: { type: 'error', message },
            },
          }));
          break;
        }
        set((state) => ({
          globalNotification: { type: 'error', message },
          sectionNotifications: {
            ...state.sectionNotifications,
            [section]: { type: 'error', message },
          },
        }));
        break;
      }

      case 'NOTIFICATION': {
        const raw = payload.message ?? '';
        if (isPrimaryGitPanelCompletionNotification(raw)) {
          const message = translateUserFacingGitMessage(raw, toneFor(payload.type));
          const bannerType: GlobalNotification['type'] =
            payload.type === 'error' ? 'error' :
              payload.type === 'warning' ? 'warning' : 'success';
          set((state) => ({
            sectionNotifications: {
              ...state.sectionNotifications,
              git: { type: bannerType, message },
            },
          }));
          break;
        }
        set((state) => {
          const section = inferSection(raw);
          const message = translateUserFacingGitMessage(raw, toneFor(payload.type));
          const pt = payload.type as 'info' | 'warning' | 'error';
          const sectionType: GlobalNotification['type'] =
            section === 'git' ? mapGitSectionBannerType(pt, raw) : pt;
          return {
            globalNotification: { type: pt, message },
            sectionNotifications: {
              ...state.sectionNotifications,
              [section]: { type: sectionType, message },
            },
          };
        });
        break;
      }

      case 'GIT_OPERATION_RESULT': {
        if (
          !payload.result.success &&
          (GIT_PANEL_OPERATION_FAILURE as readonly string[]).includes(payload.operation)
        ) {
          const raw = payload.result.error ?? `'${payload.operation}' 작업이 실패했습니다.`;
          const message = translateUserFacingGitMessage(raw, 'error');
          set((state) => ({
            sectionNotifications: {
              ...state.sectionNotifications,
              git: { type: 'error', message },
            },
          }));
          break;
        }
        if (!payload.result.success) {
          const raw = payload.result.error ?? `'${payload.operation}' 작업이 실패했습니다.`;
          const message = translateUserFacingGitMessage(raw, 'error');
          set((state) => ({
            globalNotification: { type: 'error', message },
            sectionNotifications: {
              ...state.sectionNotifications,
              git: { type: 'error', message },
            },
          }));
        }
        break;
      }

      case 'STASH_LIST':
        // git stash 목록 수신
        set({ stashes: payload.stashes });
        break;
      case 'WORKTREE_LIST':
        set({ worktrees: payload.worktrees });
        break;
      
      case 'BRANCH_CLEANUP_SETTINGS':
        // 브랜치 자동 정리 설정 수신
        set({ cleanupSettings: payload.settings });
        break;

      case 'BRANCH_CLEANUP_CANDIDATES':
        // 브랜치 자동 정리 후보 수신
        set({ cleanupPreview: payload.result });
        break;

      case 'BRANCH_CLEANUP_RESULT':
        // 브랜치 자동 정리 실행 결과 수신
        set({ cleanupExecuteResult: payload.result });
        break;
    }
  },
}));
