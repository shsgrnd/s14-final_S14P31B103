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
  type RestoreHistory,
  type SnapshotDetail,
  type SnapshotFile,
} from '@gitcat/shared-types';
import { translateUserFacingGitMessage, type UiMessageTone } from '../shared/gitMessageKo';
import { sendMessage } from '../hooks/useVsCodeApi';

/** 전역 알림 메시지 타입 */
export interface GlobalNotification {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

export interface NotificationLogEntry {
  id: string;
  type: GlobalNotification['type'];
  message: string;
  source: 'error' | 'notification' | 'operation' | 'ui';
  timestamp: number;
}

export type NotificationSection = 'git' | 'files' | 'snapshots' | 'branchCleanup' | 'stash';

export interface RestoreConfirmDialog {
  snapshotId: string;
  changedPathsCount: number;
  warningMessages: string[];
}

/**
 * `stash` 단어가 들어간 일반 Git 안내(예: 브랜치 전환 전 stash 권고)를 stash 패널로 보내지 않기 위한 판별.
 */
function isLikelyStashOperationMessage(m: string): boolean {
  if (/\bstash@\{/.test(m)) return true;
  if (/\bgit\s+stash\b/.test(m)) return true;
  if (m.includes('stash가 저장') || m.includes('stash가 적용')) return true;
  if (m.includes('stash 항목')) return true;
  if (m.includes('stash pop') || m.includes('stash drop') || m.includes('stash save')) return true;
  if (m.includes('stash 저장') || m.includes('stash 적용')) return true;
  if (/^saved working directory and index state /im.test(m.trim())) return true;
  return false;
}

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

/**
 * Extension이 `.github/pull_request_template.md`와 `.github/PULL_REQUEST_TEMPLATE.md`를
 * 각각 읽을 때, case-insensitive FS(Windows 등)에서는 같은 파일이 두 번 온다.
 * 표시·선택은 경로 기준(슬래시 통일 + 소문자)으로 한 번만 남긴다.
 */
type SnapshotMetaFileRow = NonNullable<SnapshotMeta['files']>[number];

/** SNAPSHOT_DETAIL 등에서 오는 SnapshotFile[]을 타임라인이 쓰는 메타 files 행으로 맞춘다. */
function mapSnapshotFilesToMetaRows(files: SnapshotFile[]): SnapshotMetaFileRow[] {
  return files.map((f) => ({
    path: f.filePath.replace(/\\/g, '/'),
    status: f.status,
    added: f.additions,
    removed: f.deletions,
    additions: f.additions,
    deletions: f.deletions,
    hunkCount: f.hunkCount,
    isBinary: f.isBinary,
    isLargeFile: f.isLargeFile,
    importance: f.importance,
    renamedFrom: f.renamedFrom,
    renamedTo: f.renamedTo,
  }));
}

function mergeSnapshotPatch(existing: SnapshotMeta, patch: Partial<SnapshotMeta>): SnapshotMeta {
  return {
    ...existing,
    ...patch,
    snapshotId: existing.snapshotId,
    files: patch.files ?? existing.files,
  };
}

function dedupePrTemplatesForDisplay(
  templates: OutboundPayload<'PR_TEMPLATES'>['templates'],
): OutboundPayload<'PR_TEMPLATES'>['templates'] {
  const seen = new Set<string>();
  const out: OutboundPayload<'PR_TEMPLATES'>['templates'] = [];
  for (const t of templates) {
    const key = t.path.replace(/\\/g, '/').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

interface GitCatState {
  // Data
  snapshots: SnapshotMeta[];
  // 병합 화면은 AI/DB 원본이 아니라 Webview projection DTO만 보관합니다.
  conflicts: MergeConflictCandidateView[];
  /** 사용자가 목록에서 선택한 충돌 후보 (2-컬럼 미리보기 단계) */
  selectedConflict: MergeConflictCandidateView | null;
  currentAIDraft: MergeProposalView | null;
  /** 마지막 CONFLICT_RESULT 상위 analysisId (가드·수동 분석 공통) */
  mergeConflictAnalysisId: string | null;
  mergeConflictArtifactPath: string | null;
  /** 각 candidateId 별 처리 상태 (accepted | rejected) */
  resolvedCandidates: Record<string, 'accepted' | 'rejected'>;
  /** candidateId 변경(재분석) 후에도 파일 단위로 반영 상태 유지 */
  resolvedCandidatesByFilePath: Record<string, 'accepted' | 'rejected'>;
  /** ACCEPT_MERGE로 워킹트리에 쓴 최종 텍스트 (상단 미리보기용) */
  appliedFileContents: Record<string, string>;
  /** CONFLICT_RESULT를 유발한 원래 Git 동작 (push | pull | pr | merge) */
  pendingGitAction: 'push' | 'pull' | 'pr' | 'merge' | null;
  /** merge 충돌 시 재시도에 필요한 source 브랜치 이름 */
  pendingMergeSource: string | null;
  /** PR 충돌 해결 후 커밋&푸시 완료 — 다음 CREATE_PR 시 충돌 가드를 건너뜀 */
  prSkipMergeGuard: boolean;
  /** Extension LOADING target mergeAnalysis */
  isMergeAnalysisLoading: boolean;
  /** Extension LOADING target mergeProposal */
  isMergeProposalLoading: boolean;
  /** ACCEPT_MERGE 후 로컬만 반영됨을 안내하는 카피 */
  mergeApplyFollowupHint: string | null;
  /** 수락/거절 응답 대기 중인 피드백 (optimistic resolved 방지) */
  pendingMergeFeedback: {
    candidateId: string;
    filePath: string;
    status: 'accepted' | 'rejected';
    proposedContent?: string;
  } | null;
  currentBranch: string;
  currentWorktreePath: string;
  isAnalyzing: boolean;
  isRefreshingStatus: boolean;
  isLoadingStatusSummary: boolean;
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
  notificationLogs: NotificationLogEntry[];

  // Merge 결과 (MERGE_COMPLETE 수신 시 설정, 충돌 시 ERROR에서 파싱)
  mergeResult: MergeResult | null;

  // Git 상태 요약 (GET_GIT_STATUS_SUMMARY 요청 후 GIT_STATUS_SUMMARY 수신 시 갱신)
  statusSummary: GitStatusSummary | null;

  // AI PR 설명 추천 결과 (PR_SUGGESTION 수신 시 갱신)
  prSuggestion: PRSuggestion | null;
  isPrLoading: boolean;
  isCreatingPr: boolean;
  aiBranchSuggestions: string[];
  branchSuggestionNonce: number;
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
   *  - `[...]`    : 사용 가능한 template 목록 (표시 전 경로 대소문자만 다른 동일 항목은 1개로 합침)
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

  /** 브랜치 정리 패널이「자동 정리 구성」설정 화면일 때 true — 섹션 알림을 패널 안에 유지 */
  branchCleanupInSettingsMode: boolean;

  /** 복원 이력 (GET_RESTORE_HISTORY / RESTORE_SNAPSHOT 이후 응답) */
  restoreHistories: RestoreHistory[];
  /** 스냅샷 단일 파일 diff 패널 (GET_SNAPSHOT_FILE_DIFF 응답) */
  snapshotFileDiff: OutboundPayload<'SNAPSHOT_FILE_DIFF'> | null;
  restoreConfirmDialog: RestoreConfirmDialog | null;

  // Actions
  setSnapshots: (snapshots: SnapshotMeta[]) => void;
  setConflicts: (conflicts: MergeConflictCandidateView[]) => void;
  setSelectedConflict: (conflict: MergeConflictCandidateView | null) => void;
  setAIDraft: (draft: MergeProposalView | null) => void;
  /** 충돌 후보 처리 결과를 기록합니다 */
  markCandidateResolved: (candidateId: string, status: 'accepted' | 'rejected', filePath?: string) => void;
  /** 수락/거절 실패 시 optimistic 상태 롤백 */
  unmarkCandidateResolved: (candidateId: string, filePath?: string) => void;
  /** ACCEPT_MERGE / REJECT_MERGE 전송 직후 — 서버 응답 전까지 resolved 표시 금지 */
  beginMergeFeedback: (payload: {
    candidateId: string;
    filePath: string;
    status: 'accepted' | 'rejected';
    proposedContent?: string;
  }) => void;
  clearPendingMergeFeedback: () => void;
  setAppliedFileContent: (filePath: string, content: string) => void;
  getCandidateResolvedStatus: (conflict: MergeConflictCandidateView) => 'accepted' | 'rejected' | undefined;
  /** 모든 충돌 후보 처리 상태를 초기화합니다 */
  clearResolvedCandidates: () => void;
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
  clearNotificationLogs: () => void;
  removeNotificationLog: (id: string) => void;
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
  setBranchCleanupInSettingsMode: (open: boolean) => void;
  clearSnapshotFileDiff: () => void;
  /** 병합 검토 UI 상태 초기화(Extension 분석 데이터는 그대로) */
  clearMergeReviewUi: () => void;
  clearMergeApplyHint: () => void;
  clearRestoreConfirmDialog: () => void;

  handleMessage: (event: MessageEvent<OutboundMessage>) => void;
}

/** Grid 액션 완료 등 백엔드 NOTIFICATION 원문 매칭 */
function mergeResolvedStateForConflicts(
  conflicts: MergeConflictCandidateView[],
  resolvedCandidates: Record<string, 'accepted' | 'rejected'>,
  resolvedCandidatesByFilePath: Record<string, 'accepted' | 'rejected'>,
  preserve: boolean,
  incomingResolved?: Record<string, 'accepted' | 'rejected'>,
  incomingByFile?: Record<string, 'accepted' | 'rejected'>,
): {
  resolvedCandidates: Record<string, 'accepted' | 'rejected'>;
  resolvedCandidatesByFilePath: Record<string, 'accepted' | 'rejected'>;
} {
  const byFile = preserve
    ? { ...resolvedCandidatesByFilePath, ...incomingByFile }
    : { ...incomingByFile };
  const byId = preserve
    ? { ...resolvedCandidates, ...incomingResolved }
    : { ...incomingResolved };

  for (const conflict of conflicts) {
    const fromFile = byFile[conflict.filePath];
    if (fromFile && !byId[conflict.candidateId]) {
      byId[conflict.candidateId] = fromFile;
    }
    const fromId = byId[conflict.candidateId];
    if (fromId) {
      byFile[conflict.filePath] = fromId;
    }
  }

  return { resolvedCandidates: byId, resolvedCandidatesByFilePath: byFile };
}

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

function makeLogEntry(
  type: GlobalNotification['type'],
  message: string,
  source: NotificationLogEntry['source'],
): NotificationLogEntry {
  const timestamp = Date.now();
  return {
    id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    source,
    timestamp,
  };
}

function isCheckoutFailureMessage(raw: string): boolean {
  const m = raw.toLowerCase();
  return (
    m.includes('checkout') ||
    m.includes('switch branches') ||
    m.includes('브랜치 전환') ||
    m.includes('브랜치를 전환') ||
    m.includes('브랜치 변경')
  );
}

const GIT_PANEL_OPERATION_FAILURE = ['GIT_ADD_ALL', 'EXECUTE_COMMIT', 'GIT_PUSH', 'EXECUTE_PULL', 'RUN_MERGE', 'CHECKOUT_BRANCH', 'APPLY_BRANCH'] as const;

export const useGitCatStore = create<GitCatState>((set, get) => ({
  snapshots: [],
  conflicts: [],
  selectedConflict: null,
  currentAIDraft: null,
  mergeConflictAnalysisId: null,
  mergeConflictArtifactPath: null,
  resolvedCandidates: {},
  resolvedCandidatesByFilePath: {},
  appliedFileContents: {},
  pendingGitAction: null,
  pendingMergeSource: null,
  prSkipMergeGuard: false,
  isMergeAnalysisLoading: false,
  isMergeProposalLoading: false,
  mergeApplyFollowupHint: null,
  pendingMergeFeedback: null,
  currentBranch: '',
  currentWorktreePath: '',
  isAnalyzing: false,
  isRefreshingStatus: false,
  isLoadingStatusSummary: false,
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
  notificationLogs: [],
  mergeResult: null,
  statusSummary: null,
  prSuggestion: null,
  isPrLoading: false,
  isCreatingPr: false,
  aiBranchSuggestions: [],
  branchSuggestionNonce: 0,
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
  branchCleanupInSettingsMode: false,
  restoreHistories: [],
  snapshotFileDiff: null,
  restoreConfirmDialog: null,

  setSnapshots: (snapshots) => set({ snapshots }),
  setConflicts: (conflicts) => set({ conflicts }),
  setSelectedConflict: (selectedConflict) => set({ selectedConflict, currentAIDraft: null }),
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
      notificationLogs: [...state.notificationLogs, makeLogEntry(notification.type, notification.message, 'ui')],
    })),
  clearNotificationLogs: () => set({ notificationLogs: [] }),
  removeNotificationLog: (id) =>
    set((state) => ({
      notificationLogs: state.notificationLogs.filter((l) => l.id !== id),
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
  setBranchCleanupInSettingsMode: (open) => set({ branchCleanupInSettingsMode: open }),
  clearSnapshotFileDiff: () => set({ snapshotFileDiff: null }),
  clearMergeReviewUi: () => {
    sendMessage('CLEAR_MERGE_REVIEW_UI', {});
    set({
      conflicts: [],
      selectedConflict: null,
      currentAIDraft: null,
      mergeConflictAnalysisId: null,
      mergeConflictArtifactPath: null,
      mergeApplyFollowupHint: null,
      isMergeAnalysisLoading: false,
      isMergeProposalLoading: false,
      isAnalyzing: false,
      resolvedCandidates: {},
      resolvedCandidatesByFilePath: {},
      appliedFileContents: {},
      pendingGitAction: null,
      pendingMergeSource: null,
      pendingMergeFeedback: null,
    });
  },
  markCandidateResolved: (candidateId, status, filePath) =>
    set((state) => ({
      resolvedCandidates: { ...state.resolvedCandidates, [candidateId]: status },
      resolvedCandidatesByFilePath: filePath
        ? { ...state.resolvedCandidatesByFilePath, [filePath]: status }
        : state.resolvedCandidatesByFilePath,
    })),
  unmarkCandidateResolved: (candidateId, filePath) =>
    set((state) => {
      const { [candidateId]: _removed, ...resolvedCandidates } = state.resolvedCandidates;
      const resolvedCandidatesByFilePath = { ...state.resolvedCandidatesByFilePath };
      if (filePath) {
        delete resolvedCandidatesByFilePath[filePath];
      }
      const appliedFileContents = { ...state.appliedFileContents };
      if (filePath) {
        delete appliedFileContents[filePath];
      }
      return { resolvedCandidates, resolvedCandidatesByFilePath, appliedFileContents };
    }),
  beginMergeFeedback: (payload) => set({ pendingMergeFeedback: payload }),
  clearPendingMergeFeedback: () => set({ pendingMergeFeedback: null }),
  setAppliedFileContent: (filePath, content) =>
    set((state) => ({
      appliedFileContents: { ...state.appliedFileContents, [filePath]: content },
    })),
  getCandidateResolvedStatus: (conflict) => {
    const state = get();
    return (
      state.resolvedCandidates[conflict.candidateId] ??
      state.resolvedCandidatesByFilePath[conflict.filePath]
    );
  },
  clearResolvedCandidates: () =>
    set({
      resolvedCandidates: {},
      resolvedCandidatesByFilePath: {},
      appliedFileContents: {},
      pendingGitAction: null,
      pendingMergeSource: null,
      pendingMergeFeedback: null,
    }),
  clearMergeApplyHint: () => set({ mergeApplyFollowupHint: null }),
  clearRestoreConfirmDialog: () => set({ restoreConfirmDialog: null }),

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
      if (isLikelyStashOperationMessage(m)) {
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
        set({ snapshots: payload.snapshots ?? [] });
        break;

      case 'SNAPSHOT_CREATED': {
        const snap = payload.snapshot as SnapshotMeta;
        set((state) => {
          if (state.snapshots.some((s) => s.snapshotId === snap.snapshotId)) {
            return {};
          }
          return { snapshots: [snap, ...state.snapshots] };
        });
        break;
      }

      case 'SNAPSHOT_UPDATED': {
        const snap = payload.snapshot as Partial<SnapshotMeta> & { snapshotId: string };
        set((state) => {
          const idx = state.snapshots.findIndex((s) => s.snapshotId === snap.snapshotId);
          if (idx === -1) {
            return { snapshots: [{ ...snap } as SnapshotMeta, ...state.snapshots] };
          }
          const next = [...state.snapshots];
          next[idx] = mergeSnapshotPatch(next[idx]!, snap);
          return { snapshots: next };
        });
        break;
      }

      case 'SNAPSHOT_DETAIL': {
        const detail = payload.detail as SnapshotDetail;
        const id = detail.meta.snapshotId;
        set((state) => {
          const idx = state.snapshots.findIndex((s) => s.snapshotId === id);
          if (idx === -1) {
            const files = detail.files?.length ? mapSnapshotFilesToMetaRows(detail.files) : detail.meta.files;
            const row: SnapshotMeta = { ...detail.meta, files };
            return { snapshots: [row, ...state.snapshots] };
          }
          const next = [...state.snapshots];
          const existing = next[idx]!;
          const files = detail.files?.length
            ? mapSnapshotFilesToMetaRows(detail.files)
            : (detail.meta.files ?? existing.files);
          next[idx] = mergeSnapshotPatch(existing, { ...detail.meta, files });
          return { snapshots: next };
        });
        break;
      }

      case 'SNAPSHOT_FILE_DIFF':
        set({ snapshotFileDiff: payload });
        break;

      case 'RESTORE_DONE': {
        const sid = (payload as OutboundPayload<'RESTORE_DONE'>).snapshotId;
        set((state) => ({
          restoreConfirmDialog: null,
          sectionNotifications: {
            ...state.sectionNotifications,
            snapshots: {
              type: 'success',
              message: translateUserFacingGitMessage(
                `스냅샷 시점으로 복원했습니다. (대상: ${sid})`,
                'success',
              ),
            },
          },
        }));
        break;
      }

      case 'RESTORE_CONFIRM_REQUIRED':
        set({
          restoreConfirmDialog: {
            snapshotId: payload.snapshotId,
            changedPathsCount: payload.changedPathsCount ?? 0,
            warningMessages: payload.warningMessages ?? [],
          },
        });
        break;

      case 'RESTORE_HISTORY_LIST':
        set({ restoreHistories: payload.histories ?? [] });
        break;
      case 'BRANCH_LIST':
        set({ branches: payload.branches });
        break;
      case 'GIT_STATUS_UPDATED': {
        const status = (payload as { status?: Record<string, unknown> }).status ?? (payload as Record<string, unknown>);
        const branch =
          (status.branch as string | undefined) ??
          (status.currentBranch as string | undefined) ??
          'HEAD';
        const staged = (status.staged as { length?: number }[] | undefined) ?? [];
        set({
          currentBranch: branch,
          currentWorktreePath: (status.currentWorktreePath as string | undefined) ?? '',
          isRefreshingStatus: false,
          lastStatusRefreshAt: Date.now(),
          stagedCount: Array.isArray(staged) ? staged.length : 0,
        });
        break;
      }
      case 'LOADING':
        if (payload.target === 'status') {
          set({ isRefreshingStatus: payload.loading });
        }
        if (payload.target === 'statusSummary') {
          set({ isLoadingStatusSummary: payload.loading });
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
        if (payload.target === 'mergeAnalysis') {
          set({
            isMergeAnalysisLoading: payload.loading,
            isAnalyzing: payload.loading,
          });
        }
        if (payload.target === 'mergeProposal') {
          set({ isMergeProposalLoading: payload.loading });
        }
        break;
      case 'MERGE_COMPARE_CONTENT': {
        const compare = payload as {
          analysisId: string;
          candidateId: string;
          sourceExcerpt?: string;
          targetExcerpt?: string;
          baseExcerpt?: string;
          sourceFullContent?: string;
          targetFullContent?: string;
          baseFullContent?: string;
          conflictRegions?: import('@gitcat/shared-types').MergeConflictRegion[];
        };
        const patchCandidate = (
          candidate: import('@gitcat/shared-types').MergeConflictCandidateView,
        ) => {
          if (candidate.candidateId !== compare.candidateId) {
            return candidate;
          }
          return {
            ...candidate,
            sourceExcerpt: compare.sourceExcerpt ?? candidate.sourceExcerpt,
            targetExcerpt: compare.targetExcerpt ?? candidate.targetExcerpt,
            baseExcerpt: compare.baseExcerpt ?? candidate.baseExcerpt,
            sourceFullContent: compare.sourceFullContent,
            targetFullContent: compare.targetFullContent,
            baseFullContent: compare.baseFullContent,
            conflictRegions: compare.conflictRegions ?? candidate.conflictRegions,
            compareContentTruncated: false,
          };
        };
        set((state) => ({
          conflicts: state.conflicts.map(patchCandidate),
          selectedConflict: state.selectedConflict
            ? patchCandidate(state.selectedConflict)
            : null,
        }));
        break;
      }
      case 'CONFLICT_RESULT': {
        const conflictPayload = payload as {
          preserveResolvedCandidates?: boolean;
          resolvedCandidates?: Record<string, 'accepted' | 'rejected'>;
          resolvedCandidatesByFilePath?: Record<string, 'accepted' | 'rejected'>;
          appliedFileContents?: Record<string, string>;
          triggeringAction?: GitCatState['pendingGitAction'];
          mergeSource?: string;
        };
        const preserveResolved = conflictPayload.preserveResolvedCandidates === true;
        const nextConflicts = payload.candidates ?? [];
        set((state) => {
          const merged = mergeResolvedStateForConflicts(
            nextConflicts,
            state.resolvedCandidates,
            state.resolvedCandidatesByFilePath,
            preserveResolved,
            conflictPayload.resolvedCandidates,
            conflictPayload.resolvedCandidatesByFilePath,
          );
          const incomingApplied = conflictPayload.appliedFileContents ?? {};
          return {
            conflicts: nextConflicts,
            mergeConflictAnalysisId: payload.analysisId ?? null,
            mergeConflictArtifactPath: payload.artifactPath ?? null,
            mergeApplyFollowupHint: null,
            resolvedCandidates: merged.resolvedCandidates,
            resolvedCandidatesByFilePath: merged.resolvedCandidatesByFilePath,
            appliedFileContents: preserveResolved
              ? { ...state.appliedFileContents, ...incomingApplied }
              : incomingApplied,
            pendingGitAction: conflictPayload.triggeringAction ?? state.pendingGitAction,
            pendingMergeSource: conflictPayload.mergeSource ?? state.pendingMergeSource,
          };
        });
        break;
      }
      case 'CANDIDATE_RESOLVED': {
        const resolvedPayload = payload as {
          candidateId: string;
          filePath: string;
          status: 'accepted' | 'rejected';
        };
        const pendingFeedback = get().pendingMergeFeedback;
        const matchesPending = pendingFeedback?.candidateId === resolvedPayload.candidateId;
        if (matchesPending) {
          if (
            resolvedPayload.status === 'accepted'
            && pendingFeedback?.proposedContent
          ) {
            get().setAppliedFileContent(
              resolvedPayload.filePath,
              pendingFeedback.proposedContent,
            );
          }
          set((state) => ({
            pendingMergeFeedback: null,
            currentAIDraft:
              state.currentAIDraft?.candidateId === resolvedPayload.candidateId
                ? null
                : state.currentAIDraft,
          }));
        }
        get().markCandidateResolved(
          resolvedPayload.candidateId,
          resolvedPayload.status,
          resolvedPayload.filePath,
        );
        break;
      }
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
        set((state) => ({
          aiBranchSuggestions: payload.names,
          branchSuggestionNonce: state.branchSuggestionNonce + 1,
          pendingRecommendationFlow: null,
          branchRecommendationError: null,
        }));
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
          // PR 생성 성공 후 skipGuard 플래그 초기화
          prSkipMergeGuard: false,
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
        // PR 템플릿 목록 수신 — 사용자 선택 UI에서 사용 (동일 파일 대소문자 중복 제거)
        set({
          prTemplates: dedupePrTemplatesForDisplay(payload.templates),
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
        const errorDomain = (payload as { domain?: string }).domain;
        const pendingMergeFeedback = get().pendingMergeFeedback;
        if (pendingMergeFeedback && errorDomain === 'merge_feedback') {
          get().unmarkCandidateResolved(
            pendingMergeFeedback.candidateId,
            pendingMergeFeedback.filePath,
          );
          const message = translateUserFacingGitMessage(rawMsg, 'error');
          set({
            pendingMergeFeedback: null,
            globalNotification: { type: 'error', message },
            sectionNotifications: {
              ...get().sectionNotifications,
              git: { type: 'error', message },
            },
            notificationLogs: [
              ...get().notificationLogs,
              makeLogEntry('error', message, 'error'),
            ],
          });
          break;
        }
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
        const checkoutFailure = isCheckoutFailureMessage(rawMsg);
        if (section === 'git') {
          // When we are in the middle of a merge review (pendingGitAction is set),
          // the error must also appear in globalNotification so the editor panel's
          // ConflictAnalysisView retryError banner can display it.
          const inMergeReview = !!get().pendingGitAction;
          set((state) => ({
            globalNotification: inMergeReview ? { type: 'error', message } : state.globalNotification,
            sectionNotifications: {
              ...state.sectionNotifications,
              git: { type: 'error', message },
            },
            notificationLogs: [...state.notificationLogs, makeLogEntry('error', message, 'error')],
          }));
          break;
        }
        if (checkoutFailure) {
          // 브랜치 전환류 오류는 Git & AI 한 곳에만 표시 (stash 권고 문구 때문에 inferSection이 stash로 잡히던 중복 방지)
          set((state) => ({
            globalNotification: { type: 'error', message },
            sectionNotifications: {
              ...state.sectionNotifications,
              git: { type: 'error', message },
            },
            notificationLogs: [...state.notificationLogs, makeLogEntry('error', message, 'error')],
          }));
          break;
        }
        set((state) => ({
          globalNotification: { type: 'error', message },
          sectionNotifications: {
            ...state.sectionNotifications,
            [section]: { type: 'error', message },
          },
          notificationLogs: [...state.notificationLogs, makeLogEntry('error', message, 'error')],
        }));
        break;
      }

      case 'NOTIFICATION': {
        const raw = payload.message ?? '';
        if (raw.includes('병합 제안을 수락')) {
          const message = translateUserFacingGitMessage(raw, toneFor(payload.type));
          set((state) => ({
            // Merge 시나리오는 "Merge 다시 시도" 버튼이 자동으로 stage+commit 처리하므로
            // 수동 스테이징/커밋/푸시 안내 배너를 표시하지 않는다.
            mergeApplyFollowupHint: state.pendingGitAction === 'merge' ? null
              : '제안이 로컬 작업 트리에 반영되었습니다. 스테이징(Add) → 커밋 → 푸시로 원격 저장소에 반영하세요.',
            globalNotification: { type: 'success', message },
            sectionNotifications: {
              ...state.sectionNotifications,
              git: { type: 'success', message },
            },
            notificationLogs: [...state.notificationLogs, makeLogEntry('success', message, 'notification')],
          }));
          break;
        }
        if (isPrimaryGitPanelCompletionNotification(raw)) {
          const message = translateUserFacingGitMessage(raw, toneFor(payload.type));
          const bannerType: GlobalNotification['type'] =
            payload.type === 'error' ? 'error' :
              payload.type === 'warning' ? 'warning' : 'success';
          set((state) => {
            // pull/push/merge 성공 시 병합 리뷰 UI 자동 정리
            const shouldClearMerge =
              bannerType === 'success' && state.pendingGitAction !== null;
            // PR 충돌 해결 후 커밋&푸시 성공: PR 패널을 자동으로 열어 바로 PR 생성 가능하게 함
            const isPrConflictResolved = shouldClearMerge && state.pendingGitAction === 'pr';
            if (isPrConflictResolved) {
              // skipGuard: true → extension 측에서 다음 CREATE_PR 가드를 건너뜀
              // PR 패널은 별도 webview라 store 상태를 공유하지 않으므로 extension 측에서 플래그 관리
              setTimeout(() => sendMessage('OPEN_PR_PANEL', { skipGuard: true }), 50);
            }
            return {
              // 병합 검토 흐름에서 성공/완료 알림은 globalNotification에도 표시하여
              // 에디터 패널이 닫힌 뒤 사용자가 결과를 알 수 있도록 한다.
              globalNotification: bannerType === 'success'
                ? { type: 'success', message }
                : (shouldClearMerge ? null : state.globalNotification),
              sectionNotifications: {
                ...state.sectionNotifications,
                git: { type: bannerType, message },
              },
              notificationLogs: [...state.notificationLogs, makeLogEntry(bannerType, message, 'notification')],
              ...(shouldClearMerge ? {
                conflicts: [],
                selectedConflict: null,
                currentAIDraft: null,
                mergeConflictAnalysisId: null,
                mergeConflictArtifactPath: null,
                mergeApplyFollowupHint: null,
                isMergeAnalysisLoading: false,
                isMergeProposalLoading: false,
                isAnalyzing: false,
                resolvedCandidates: {},
                resolvedCandidatesByFilePath: {},
                appliedFileContents: {},
                pendingGitAction: null,
                pendingMergeSource: null,
                // PR 충돌 해결 후 푸시 성공: 다음 CREATE_PR 시 가드 건너뜀
                prSkipMergeGuard: isPrConflictResolved,
              } : {}),
            };
          });
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
            notificationLogs: [...state.notificationLogs, makeLogEntry(sectionType, message, 'notification')],
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
            notificationLogs: [...state.notificationLogs, makeLogEntry('error', message, 'operation')],
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
            notificationLogs: [...state.notificationLogs, makeLogEntry('error', message, 'operation')],
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
