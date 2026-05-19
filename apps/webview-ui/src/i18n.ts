export type Locale = 'en' | 'ko';

type MessageValue = string | ((params?: Record<string, string | number>) => string);

declare global {
  interface Window {
    GITCAT_LOCALE?: Locale;
    GITCAT_AUTO_LOCALE?: Locale;
    GITCAT_LANGUAGE_SETTING?: Locale | 'auto';
  }
}

const DEFAULT_LOCALE: Locale = 'en';

const messages: Record<Locale, Record<string, MessageValue>> = {
  en: {
    'loading.title': 'GitCat is loading...',
    'loading.ready': 'Preparing the sidebar and initial data.',
    'loading.slow': 'Initial loading is taking longer than expected. Try reopening the view in a moment.',

    'git.refreshing': 'Refreshing Git status...',
    'git.updatedAt': (params) => `Updated ${params?.time ?? ''}`,
    'git.notRefreshed': 'Not refreshed yet',
    'git.manualRefresh': 'Manual refresh',
    'git.noRepository': 'No Git repository found',
    'git.noRepositoryHelp': 'Open a project folder that contains a `.git` directory from File > Open Folder...',
    'git.currentBranchMissing': 'Repository not connected',
    'git.switching': 'Switching...',
    'git.branchList.empty': 'No other local branches.',
    'git.worktrees': (params) => `Worktrees (${params?.count ?? 0})`,
    'git.worktrees.empty': 'No additional worktrees.',
    'git.detached': '(detached)',
    'git.current': 'current',
    'git.newBranch.title': 'Create New Branch',
    'git.newBranch.placeholder': 'Enter a new branch name',
    'git.newBranch.create': 'Create',
    'git.newBranch.cancel': 'Cancel',
    'git.newBranch.invalidWhitespace': 'Branch names cannot contain spaces. Please enter a name without spaces.',
    'git.ai.suggest': 'AI Suggest',
    'git.ai.suggesting': 'Suggesting...',
    'git.ai.close': 'Cancel',
    'git.ai.submit': 'Submit',
    'git.ai.submitting': 'Generating...',
    'git.ai.promptBranch': 'Describe the work you are planning so GitCat can suggest a branch name.',
    'git.ai.promptCommit': 'Describe what changed so GitCat can suggest a commit message.',
    'git.push': 'Git Push',
    'git.pushing': 'Pushing...',
    'git.pull': 'Git Pull',
    'git.pulling': 'Pulling...',
    'git.pr.create': 'Create PR',
    'git.pr.opening': 'Opening...',
    'git.merge': 'Merge',
    'git.merging': 'Merging...',
    'git.merge.title': 'Select branches to merge',
    'git.merge.source': 'Source branch',
    'git.merge.sourcePlaceholder': 'Choose a branch to merge from',
    'git.merge.target': 'Target branch',
    'git.merge.run': 'Run Merge',
    'git.cancel': 'Cancel',

    'git.language.label': 'Language',
    'git.language.current': (params) => `Current: ${params?.value ?? ''}`,
    'git.language.auto': 'Auto',
    'git.language.english': 'English',
    'git.language.korean': 'Korean',
    'git.merge.sameBranch': 'Source and target branches must be different.',
    'git.commit.stageRequired': 'Stage files before creating a commit.',

    'sidebar.section.files': 'Files',
    'sidebar.section.snapshots': 'Snapshots',
    'sidebar.section.branchCleanup': 'Branch Cleanup',
    'sidebar.section.gitStash': 'Git Stash',
    'sidebar.notificationCenter': 'Notifications',
    'sidebar.notificationCenter.empty': 'No notifications yet.',
    'sidebar.notificationCenter.clearAll': 'Clear all notification logs',
    'sidebar.notificationCenter.clearAllConfirm': 'Clear all notification logs?',
    'sidebar.notificationCenter.dismiss': 'Dismiss',
    'sidebar.notificationCenter.close': 'Close',
    'sidebar.settings.aiApiKey': 'AI API settings',
    'sidebar.settings.pr': 'PR settings',

    'snapshots.empty': 'No snapshots yet.',
    'snapshots.createManual': 'Create manual snapshot',
    'snapshots.createManualTitle': 'Create a manual snapshot with the current changes.',
    'snapshots.createAuto': (params) => `Manual snapshot (${params?.time ?? ''})`,
    'snapshots.files': (params) => `${params?.count ?? 0} files`,
    'snapshots.changedFilesEmpty': 'No changed files.',
    'snapshots.renameSuffix': 'edited',
    'snapshots.renameTitle': 'Rename snapshot',
    'snapshots.deleteTitle': 'Delete snapshot',
    'snapshots.fileDiffTitle': (params) => `View snapshot diff: ${params?.path ?? ''}`,
    'snapshots.restore': 'Restore to this snapshot',
    'snapshots.restoreTitle': 'Restore the working tree to this snapshot.',
    'snapshots.viewAll': 'View full restore history',
    'snapshots.viewAllTitle': 'Open the full restore history.',
    'snapshots.diffDialog': 'Snapshot file diff',
    'snapshots.diffDialogHeader': (params) => `Changed file diff - ${params?.path ?? ''}`,
    'snapshots.close': 'Close',
    'snapshots.restoreHistory': 'Restore history',
    'snapshots.restoreHistoryEmpty': 'No restore history.',
    'snapshots.restoreHistoryEntry': (params) =>
      `${params?.time ?? ''} - ${params?.status ?? ''}`,
    'snapshots.restoreHistoryFlow': (params) =>
      `${params?.from ?? ''} -> ${params?.to ?? ''}`,
    'snapshots.restoreConfirm.title': 'Large restore warning',
    'snapshots.restoreConfirm.body': (params) =>
      `${params?.count ?? 0} paths will be changed by this restore. Review the warnings below before continuing.`,
    'snapshots.restoreConfirm.cancel': 'Cancel',
    'snapshots.restoreConfirm.confirm': 'Restore anyway',

    'snapshot.status.modified': 'Modified',
    'snapshot.status.added': 'Added',
    'snapshot.status.deleted': 'Deleted',
    'snapshot.status.renamed': 'Renamed',

    'relative.justNow': 'just now',
    'relative.minutesAgo': (params) => `${params?.count ?? 0} min ago`,
    'relative.hoursAgo': (params) => `${params?.count ?? 0} hr ago`,
    'relative.daysAgo': (params) => `${params?.count ?? 0} day ago`,

    'branchCleanup.header': 'Branch Cleanup',
    'branchCleanup.settings': 'Cleanup Settings',
    'branchCleanup.selectable': (params) =>
      `Selectable Branches (${params?.selected ?? 0}/${params?.total ?? 0})`,
    'branchCleanup.status.active': 'Current Active',
    'branchCleanup.status.merged': 'Merged',
    'branchCleanup.status.stale': 'Stale',
    'branchCleanup.status.protected': 'Protected',
    'branchCleanup.recommended': 'Recommended',
    'branchCleanup.noRepository': 'No Git repository found. Connect a repository to use branch cleanup.',
    'branchCleanup.settingsLoading': 'Loading cleanup settings...',
    'branchCleanup.settingsRetry': 'Retry',
    'branchCleanup.settingsSection': 'Rules',
    'branchCleanup.settingsEnabled': 'Enable automatic branch cleanup',
    'branchCleanup.settingsOlderThan': 'Older than',
    'branchCleanup.settingsWeek': 'week',
    'branchCleanup.settingsMonth': 'month',
    'branchCleanup.settingsDeleteMerged': 'Delete merged branches',
    'branchCleanup.protectedSection': 'Protected Branches',
    'branchCleanup.protectedPlaceholder': 'Enter a branch name',
    'branchCleanup.protectedAddTitle': 'Add protected branch',
    'branchCleanup.resetDefaults': 'Restore defaults',
    'branchCleanup.save': 'Save',
    'branchCleanup.saved': 'Saved',
    'branchCleanup.noChanges': 'No changes to save',
    'branchCleanup.deleteSelected': (params) =>
      `Delete ${params?.count ?? 0} selected branch(es)`,
    'branchCleanup.deleteConfirmTitle': 'Confirm branch deletion',
    'branchCleanup.deleteConfirmBody': (params) =>
      `Delete ${params?.count ?? 0} selected branch(es)?`,
    'branchCleanup.warning.active': (params) =>
      `Branch '${params?.name ?? ''}' is the current active branch and cannot be deleted.`,
    'branchCleanup.warning.protected': (params) =>
      `Branch '${params?.name ?? ''}' is protected and cannot be deleted.`,
    'branchCleanup.warning.settingsMissing': 'Cleanup settings are not ready yet. Please try again in a moment.',
    'branchCleanup.warning.protectedExists': 'That protected branch is already in the list.',

    'stash.save': 'Save Stash',
    'stash.saveDescription': 'Save the current changes into a stash entry.',
    'stash.inputLabel': 'Save the current changes as a stash.',
    'stash.inputPlaceholder': 'Optional note',
    'stash.empty': 'No saved stashes.',
    'stash.noRepository': 'Repository not connected. Stash features are unavailable.',
    'stash.apply': 'Apply',
    'stash.pop': 'Pop',
    'stash.drop': 'Drop',
    'stash.applyTitle': 'Apply this stash and keep it in the list.',
    'stash.popTitle': 'Apply this stash and remove it from the list.',
    'stash.dropTitle': 'Delete this stash entry without applying it.',
    'stash.refresh': 'Refresh list',
  },
  ko: {
    'loading.title': 'GitCat을 불러오는 중...',
    'loading.ready': '사이드바와 초기 데이터를 준비하고 있습니다.',
    'loading.slow': '초기 로딩이 예상보다 오래 걸리고 있습니다. 잠시 후 다시 열어 보세요.',

    'git.refreshing': 'Git 상태를 새로 고치는 중...',
    'git.updatedAt': (params) => `${params?.time ?? ''}에 업데이트됨`,
    'git.notRefreshed': '아직 새로 고치지 않음',
    'git.manualRefresh': '수동 새로 고침',
    'git.noRepository': 'Git 저장소를 찾을 수 없습니다',
    'git.noRepositoryHelp': 'File > Open Folder...에서 `.git` 디렉터리가 있는 프로젝트 폴더를 여세요.',
    'git.currentBranchMissing': '저장소가 연결되지 않음',
    'git.switching': '전환 중...',
    'git.branchList.empty': '다른 로컬 브랜치가 없습니다.',
    'git.worktrees': (params) => `워크트리 (${params?.count ?? 0})`,
    'git.worktrees.empty': '추가 워크트리가 없습니다.',
    'git.detached': '(detached)',
    'git.current': '현재',
    'git.newBranch.title': '새 브랜치 만들기',
    'git.newBranch.placeholder': '새 브랜치 이름을 입력하세요',
    'git.newBranch.create': '만들기',
    'git.newBranch.cancel': '취소',
    'git.newBranch.invalidWhitespace': '브랜치 이름에는 공백을 넣을 수 없습니다. 공백 없이 입력해 주세요.',
    'git.ai.suggest': 'AI 추천',
    'git.ai.suggesting': '추천 중...',
    'git.ai.close': '취소',
    'git.ai.submit': '제출',
    'git.ai.submitting': '생성 중...',
    'git.ai.promptBranch': '예정된 작업을 설명하면 GitCat이 브랜치 이름을 추천합니다.',
    'git.ai.promptCommit': '변경 내용을 설명하면 GitCat이 커밋 메시지를 추천합니다.',
    'git.push': 'Git Push',
    'git.pushing': 'Push 중...',
    'git.pull': 'Git Pull',
    'git.pulling': 'Pull 중...',
    'git.pr.create': 'Create PR',
    'git.pr.opening': '열는 중...',
    'git.merge': 'Merge',
    'git.merging': 'Merge 중...',
    'git.merge.title': '병합할 브랜치 선택',
    'git.merge.source': '소스 브랜치',
    'git.merge.sourcePlaceholder': '병합할 브랜치를 고르세요',
    'git.merge.target': '대상 브랜치',
    'git.merge.run': 'Run Merge',
    'git.cancel': '취소',

    'git.language.label': '언어',
    'git.language.current': (params) => `현재: ${params?.value ?? ''}`,
    'git.language.auto': '자동',
    'git.language.english': '영어',
    'git.language.korean': '한국어',
    'git.merge.sameBranch': '소스 브랜치와 대상 브랜치는 서로 달라야 합니다.',
    'git.commit.stageRequired': '커밋을 만들기 전에 파일을 stage 해 주세요.',

    'sidebar.section.files': '파일',
    'sidebar.section.snapshots': '스냅샷',
    'sidebar.section.branchCleanup': '브랜치 정리',
    'sidebar.section.gitStash': 'Git Stash',
    'sidebar.notificationCenter': '알림',
    'sidebar.notificationCenter.empty': '아직 알림이 없습니다.',
    'sidebar.notificationCenter.clearAll': '알림 로그 전체 삭제',
    'sidebar.notificationCenter.clearAllConfirm': '알림 로그를 모두 삭제할까요?',
    'sidebar.notificationCenter.dismiss': '닫기',
    'sidebar.notificationCenter.close': '닫기',
    'sidebar.settings.aiApiKey': 'AI API 설정',
    'sidebar.settings.pr': 'PR 설정',

    'snapshots.empty': '아직 스냅샷이 없습니다.',
    'snapshots.createManual': '수동 스냅샷 생성',
    'snapshots.createManualTitle': '현재 변경 사항으로 수동 스냅샷을 만듭니다.',
    'snapshots.createAuto': (params) => `수동 스냅샷 (${params?.time ?? ''})`,
    'snapshots.files': (params) => `${params?.count ?? 0} files`,
    'snapshots.changedFilesEmpty': '변경된 파일이 없습니다.',
    'snapshots.renameSuffix': '수정됨',
    'snapshots.renameTitle': '스냅샷 이름 바꾸기',
    'snapshots.deleteTitle': '스냅샷 삭제',
    'snapshots.fileDiffTitle': (params) => `스냅샷 diff 보기: ${params?.path ?? ''}`,
    'snapshots.restore': '이 시점으로 원복',
    'snapshots.restoreTitle': '작업 트리를 이 스냅샷 시점으로 되돌립니다.',
    'snapshots.viewAll': '복원 기록 전체 보기',
    'snapshots.viewAllTitle': '복원 기록 전체를 엽니다.',
    'snapshots.diffDialog': '스냅샷 파일 diff',
    'snapshots.diffDialogHeader': (params) => `변경 파일 diff - ${params?.path ?? ''}`,
    'snapshots.close': '닫기',
    'snapshots.restoreHistory': '복원 기록',
    'snapshots.restoreHistoryEmpty': '복원 기록이 없습니다.',
    'snapshots.restoreHistoryEntry': (params) =>
      `${params?.time ?? ''} - ${params?.status ?? ''}`,
    'snapshots.restoreHistoryFlow': (params) =>
      `${params?.from ?? ''} -> ${params?.to ?? ''}`,
    'snapshots.restoreConfirm.title': '대규모 복원 경고',
    'snapshots.restoreConfirm.body': (params) =>
      `복원 시 ${params?.count ?? 0}개 경로가 변경됩니다. 아래 경고를 확인한 뒤 계속 진행해 주세요.`,
    'snapshots.restoreConfirm.cancel': '취소',
    'snapshots.restoreConfirm.confirm': '계속 복원',

    'snapshot.status.modified': '수정됨',
    'snapshot.status.added': '추가됨',
    'snapshot.status.deleted': '삭제됨',
    'snapshot.status.renamed': '이름 변경됨',

    'relative.justNow': '방금 전',
    'relative.minutesAgo': (params) => `${params?.count ?? 0}분 전`,
    'relative.hoursAgo': (params) => `${params?.count ?? 0}시간 전`,
    'relative.daysAgo': (params) => `${params?.count ?? 0}일 전`,

    'branchCleanup.header': '브랜치 정리',
    'branchCleanup.settings': '정리 설정',
    'branchCleanup.selectable': (params) =>
      `선택 가능 브랜치 (${params?.selected ?? 0}/${params?.total ?? 0})`,
    'branchCleanup.status.active': '현재 활성',
    'branchCleanup.status.merged': '병합됨',
    'branchCleanup.status.stale': '오래됨',
    'branchCleanup.status.protected': '보호됨',
    'branchCleanup.recommended': '자동 추천',
    'branchCleanup.noRepository': 'Git 저장소가 없습니다. 저장소를 연결하면 브랜치 정리를 사용할 수 있습니다.',
    'branchCleanup.settingsLoading': '정리 설정을 불러오는 중...',
    'branchCleanup.settingsRetry': '다시 시도',
    'branchCleanup.settingsSection': '규칙',
    'branchCleanup.settingsEnabled': '자동 브랜치 정리 사용',
    'branchCleanup.settingsOlderThan': '다음보다 오래된 브랜치',
    'branchCleanup.settingsWeek': '주',
    'branchCleanup.settingsMonth': '개월',
    'branchCleanup.settingsDeleteMerged': '병합된 브랜치 삭제',
    'branchCleanup.protectedSection': '보호 브랜치',
    'branchCleanup.protectedPlaceholder': '브랜치 이름 입력',
    'branchCleanup.protectedAddTitle': '보호 브랜치 추가',
    'branchCleanup.resetDefaults': '기본값 복원',
    'branchCleanup.save': '저장',
    'branchCleanup.saved': '저장됨',
    'branchCleanup.noChanges': '저장할 변경 없음',
    'branchCleanup.deleteSelected': (params) =>
      `선택한 ${params?.count ?? 0}개 브랜치 삭제`,
    'branchCleanup.deleteConfirmTitle': '브랜치 삭제 확인',
    'branchCleanup.deleteConfirmBody': (params) =>
      `선택한 ${params?.count ?? 0}개 브랜치를 삭제할까요?`,
    'branchCleanup.warning.active': (params) =>
      `'${params?.name ?? ''}' 브랜치는 현재 활성 브랜치이므로 삭제할 수 없습니다.`,
    'branchCleanup.warning.protected': (params) =>
      `'${params?.name ?? ''}' 브랜치는 보호 상태이므로 삭제할 수 없습니다.`,
    'branchCleanup.warning.settingsMissing': '정리 설정이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.',
    'branchCleanup.warning.protectedExists': '이미 보호 브랜치 목록에 있는 이름입니다.',

    'stash.save': 'Stash 저장',
    'stash.saveDescription': '현재 변경 사항을 stash 항목으로 저장합니다.',
    'stash.inputLabel': '현재 변경 사항을 stash로 저장합니다.',
    'stash.inputPlaceholder': '메모 (선택)',
    'stash.empty': '저장된 stash가 없습니다.',
    'stash.noRepository': '저장소가 연결되지 않았습니다. Stash 기능을 사용할 수 없습니다.',
    'stash.apply': 'Apply',
    'stash.pop': 'Pop',
    'stash.drop': 'Drop',
    'stash.applyTitle': '이 stash를 적용하고 목록에는 유지합니다.',
    'stash.popTitle': '이 stash를 적용하고 목록에서 제거합니다.',
    'stash.dropTitle': '적용하지 않고 이 stash 항목을 삭제합니다.',
    'stash.refresh': '목록 새로고침',
  },
};

export function getLocale(): Locale {
  return window.GITCAT_LOCALE === 'ko' ? 'ko' : DEFAULT_LOCALE;
}

export function getAutoLocale(): Locale {
  return window.GITCAT_AUTO_LOCALE === 'ko' ? 'ko' : DEFAULT_LOCALE;
}

export function getLanguageSetting(): Locale | 'auto' {
  return window.GITCAT_LANGUAGE_SETTING === 'ko' || window.GITCAT_LANGUAGE_SETTING === 'en'
    ? window.GITCAT_LANGUAGE_SETTING
    : 'auto';
}

export function applyLanguageSetting(setting: Locale | 'auto'): void {
  window.GITCAT_LANGUAGE_SETTING = setting;
  window.GITCAT_LOCALE = setting === 'auto' ? getAutoLocale() : setting;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const locale = getLocale();
  const localized = messages[locale][key] ?? messages[DEFAULT_LOCALE][key] ?? key;
  return typeof localized === 'function' ? localized(params) : localized;
}
