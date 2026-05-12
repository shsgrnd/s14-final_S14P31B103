import { create } from 'zustand';
import {
  SnapshotMeta,
  Branch,
  WorktreeInfo,
  OutboundMessage,
  GitStatusSummary,
  BranchCleanupSettings,
  BranchCleanupPreviewResult,
  BranchCleanupExecuteResult,
  PRSuggestion,
  OutboundPayload,
  MergeConflictCandidateView,
  MergeProposalView,
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
  snapshots: SnapshotMeta[];
  // 병합 화면은 AI/DB 원본이 아니라 Webview projection DTO만 보관합니다.
  conflicts: MergeConflictCandidateView[];
  currentAIDraft: MergeProposalView | null;
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
  stagedCount: number;

  // Phase 2 New Data
  branches: Branch[];
  aiCommitSuggestion: string;
  aiCommitAlternatives: string[];
  aiCommitSuggestedBranchNames: string[];
  commitSuggestionNonce: number;
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
  prSuggestion: PRSuggestion | null;
  isPrLoading: boolean;
  isCreatingPr: boolean;
  aiBranchSuggestions: string[];
  isBranchRecommendationLoading: boolean;
  isCommitRecommendationLoading: boolean;
  pendingRecommendationFlow: 'branch' | 'commit' | 'pr' | null;
  branchRecommendationError: string | null;
  commitRecommendationError: string | null;
  prRecommendationError: string | null;

  // 워크트리 목록 (WORKTREE_LIST 수신 시 갱신)
  worktrees: WorktreeInfo[];

  // Stash 목록 (STASH_LIST 수신 시 갱신)
  stashes: StashEntry[];

  // 브랜치 자동 정리 설정 (BRANCH_CLEANUP_SETTINGS 수신 시 갱신)
  cleanupSettings: BranchCleanupSettings | null;
  cleanupPreview: BranchCleanupPreviewResult | null;
  cleanupExecuteResult: BranchCleanupExecuteResult | null;

  /** PR 생성 폼 — GitHub collaborators / labels / milestones (GET_PR_FORM_METADATA 응답) */
  prFormMetadata: OutboundPayload<'PR_FORM_METADATA'> | null;
  isPrFormMetadataLoading: boolean;

  /**
   * PR 템플릿 목록 (PR_TEMPLATES 수신 시 갱신).
   * 사용자가 선택한 template content는 RECOMMEND_PR payload.template로 함께 전송된다.
   *
   * 의미:
   *  - `undefined`: 아직 응답을 받지 못함 (요청 진행 중 또는 미요청)
   *  - `[]`       : 응답 받았지만 사용 가능한 template 없음
   *  - `[...]`    : 사용 가능한 template 목록
   */
  prTemplates: OutboundPayload<'PR_TEMPLATES'>['templates'] | undefined;
  isPrTemplatesLoading: boolean;

  /** 마지막으로 생성된 PR 결과 (PR_CREATED 수신 시 저장) */
  lastCreatedPr: OutboundPayload<'PR_CREATED'> | null;

  /**
   * 사용자 환경설정에 저장된 기본 PR target 브랜치 (PR_DEFAULT_BASE_BRANCH 수신 시 갱신).
   * 두 webview(사이드바 / PR Create panel)가 공유하기 위해 workspaceState에 영속되며,
   * 한쪽에서 변경되면 extension이 모든 webview에 broadcast 한다.
   *
   * 의미:
   *  - `undefined`: 아직 한 번도 응답을 못 받은 상태(초기 GET 진행 중)
   *  - `null`     : 응답은 받았지만 저장된 값이 없음(자동 추론 모드)
   *  - `string`   : 저장된 브랜치 이름
   */
  prDefaultBaseBranch: string | null | undefined;

  // Actions
  setSnapshots: (snapshots: SnapshotMeta[]) => void;
  setConflicts: (conflicts: MergeConflictCandidateView[]) => void;
  setAIDraft: (draft: MergeProposalView | null) => void;
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
  clearLastCreatedPr: () => void;
  clearBranchSuggestions: () => void;
  beginRecommendationRequest: (flow: 'branch' | 'commit' | 'pr') => void;
  clearBranchRecommendationError: () => void;
  clearCommitRecommendationError: () => void;
  clearPrRecommendationError: () => void;

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

export const useGitCatStore = create<GitCatState>((set, get) => ({
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
  stagedCount: 0,
  branches: [],
  aiCommitSuggestion: '',
  aiCommitAlternatives: [],
  aiCommitSuggestedBranchNames: [],
  commitSuggestionNonce: 0,
  expandedSections: ['safety', 'branch'],
  expandedSnapshotId: null,
  globalNotification: null,
  sectionNotifications: {},
  mergeResult: null,
  statusSummary: null,
  prSuggestion: null,
  isPrLoading: false,
  isCreatingPr: false,
  aiBranchSuggestions: [],
  isBranchRecommendationLoading: false,
  isCommitRecommendationLoading: false,
  pendingRecommendationFlow: null,
  branchRecommendationError: null,
  commitRecommendationError: null,
  prRecommendationError: null,
  worktrees: [],
  stashes: [],
  cleanupSettings: null,
  cleanupPreview: null,
  cleanupExecuteResult: null,
  prFormMetadata: null,
  isPrFormMetadataLoading: false,
  prTemplates: undefined,
  isPrTemplatesLoading: false,
  lastCreatedPr: null,
  prDefaultBaseBranch: undefined,

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
  clearLastCreatedPr: () => set({ lastCreatedPr: null }),
  clearBranchSuggestions: () => set({ aiBranchSuggestions: [] }),
  beginRecommendationRequest: (flow) => set((state) => ({
    pendingRecommendationFlow: flow,
    isPrLoading: flow === 'pr' ? true : state.isPrLoading,
    branchRecommendationError: flow === 'branch' ? null : state.branchRecommendationError,
    commitRecommendationError: flow === 'commit' ? null : state.commitRecommendationError,
    prRecommendationError: flow === 'pr' ? null : state.prRecommendationError,
  })),
  clearBranchRecommendationError: () => set({ branchRecommendationError: null }),
  clearCommitRecommendationError: () => set({ commitRecommendationError: null }),
  clearPrRecommendationError: () => set({ prRecommendationError: null }),

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
          stagedCount: payload.status.staged?.length ?? 0,
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
        if (payload.target === 'CREATE_PR') {
          set({ isCreatingPr: payload.loading });
        }
        if (payload.target === 'GET_PR_FORM_METADATA') {
          set({ isPrFormMetadataLoading: payload.loading });
        }
        if (payload.target === 'GET_PR_TEMPLATES') {
          set({ isPrTemplatesLoading: payload.loading });
        }
        if (payload.target === 'branchRecommendation') {
          set({ isBranchRecommendationLoading: payload.loading });
        }
        if (payload.target === 'commitRecommendation') {
          set({ isCommitRecommendationLoading: payload.loading });
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
      case 'COMMIT_SUGGESTIONS': {
        const description = (payload.suggestions.description ?? '').trim();
        const alternatives = ((payload.suggestions.messages ?? []) as string[])
          .map((msg: string) => msg.trim())
          .filter((msg) => !!msg && msg !== description);
        const suggestedBranchNames = ((payload.suggestions.branch_names ?? []) as string[])
          .map((name: string) => name.trim())
          .filter(Boolean);
        set((state) => ({
          aiCommitSuggestion: payload.suggestions.description ?? '',
          aiCommitAlternatives: [...new Set(alternatives)],
          aiCommitSuggestedBranchNames: suggestedBranchNames,
          commitSuggestionNonce: state.commitSuggestionNonce + 1,
          pendingRecommendationFlow: null,
          commitRecommendationError: null,
        }));
        break;
      }
      case 'BRANCH_SUGGESTIONS':
        set({
          aiBranchSuggestions: payload.names,
          pendingRecommendationFlow: null,
          branchRecommendationError: null,
        });
        break;

      case 'GIT_STATUS_SUMMARY':
        set({ statusSummary: payload.summary });
        break;

      case 'PR_SUGGESTION':
        set({
          prSuggestion: payload,
          isPrLoading: false,
          pendingRecommendationFlow: null,
          prRecommendationError: null,
        });
        break;

      case 'PR_CREATED': {
        const warnings = payload.metadataWarnings ?? [];
        const baseMsg = `PR #${payload.prNumber} 생성 완료: ${payload.htmlUrl}`;
        const notifMsg =
          warnings.length > 0
            ? `${baseMsg} (일부 설정 적용 실패: ${warnings.length}건)`
            : baseMsg;
        set((state) => ({
          lastCreatedPr: payload,
          isCreatingPr: false,
          globalNotification: {
            type: warnings.length > 0 ? 'warning' : 'success',
            message: notifMsg,
          },
          sectionNotifications: {
            ...state.sectionNotifications,
            git: {
              type: warnings.length > 0 ? 'warning' : 'success',
              message: notifMsg,
            },
          },
        }));
        break;
      }

      case 'PR_FORM_METADATA':
        set({
          prFormMetadata: payload,
          isPrFormMetadataLoading: false,
        });
        break;

      case 'PR_TEMPLATES':
        // PR 템플릿 목록 수신 — 사용자 선택 UI에서 사용
        set({
          prTemplates: payload.templates,
          isPrTemplatesLoading: false,
        });
        break;

      case 'PR_DEFAULT_BASE_BRANCH':
        set({ prDefaultBaseBranch: payload.branch });
        break;

      // ── 백엔드 에러 / 알림 수신 처리 ──

      case 'MERGE_COMPLETE': {
        // Extension에서 보내는 새 payload 구조: { merge: MergeCompleteView }
        // - status: 'completed' | 'continued' → 성공
        // - status: 'conflicted'              → 충돌 (conflictedFiles 활용)
        // - status: 'aborted'                 → 사용자 중단 (mergeResult 초기화)
        const view = payload.merge;
        if (view.status === 'completed' || view.status === 'continued') {
          set({ mergeResult: { success: true } });
        } else if (view.status === 'conflicted') {
          set({
            mergeResult: {
              success: false,
              conflictedFiles: view.conflictedFiles ?? [],
            },
          });
        } else {
          // aborted: merge 흐름이 종료됐으므로 결과 배너를 닫는다.
          set({ mergeResult: null });
        }
        break;
      }

      case 'ERROR': {
        const rawMsg = payload.message ?? '';
        const recommendationFlow = get().pendingRecommendationFlow;
        const recommendationMessage = translateUserFacingGitMessage(rawMsg, 'error');
        if (recommendationFlow === 'branch') {
          set({
            branchRecommendationError: recommendationMessage,
            isBranchRecommendationLoading: false,
            pendingRecommendationFlow: null,
          });
          break;
        }
        if (recommendationFlow === 'commit') {
          set({
            commitRecommendationError: recommendationMessage,
            isCommitRecommendationLoading: false,
            pendingRecommendationFlow: null,
          });
          break;
        }
        if (recommendationFlow === 'pr') {
          set({
            prRecommendationError: recommendationMessage,
            isPrLoading: false,
            pendingRecommendationFlow: null,
          });
          break;
        }
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
