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
    'snapshots.empty': 'No snapshots yet.',
    'snapshots.createAuto': (params) => `Manual snapshot (${params?.time ?? ''})`,
    'snapshots.files': (params) => `${params?.count ?? 0} files`,
    'snapshots.changedFilesEmpty': 'No changed files.',
    'snapshots.restore': 'Restore to this snapshot',
    'snapshots.viewAll': 'View full restore history',
    'snapshots.diffDialog': 'Snapshot file diff',
    'snapshots.close': 'Close',
    'snapshots.restoreHistory': 'Restore history',
    'snapshots.restoreHistoryEmpty': 'No restore history.',
    'snapshots.restoreConfirm.title': 'Large restore warning',
    'snapshots.restoreConfirm.body': (params) => `${params?.count ?? 0} paths will be changed by this restore. Review the warnings below before continuing.`,
    'snapshots.restoreConfirm.cancel': 'Cancel',
    'snapshots.restoreConfirm.confirm': 'Restore anyway',
    'relative.justNow': 'just now',
    'relative.minutesAgo': (params) => `${params?.count ?? 0} min ago`,
    'relative.hoursAgo': (params) => `${params?.count ?? 0} hr ago`,
    'relative.daysAgo': (params) => `${params?.count ?? 0} day ago`,
  },
  ko: {
    'loading.title': 'GitCat을 불러오는 중입니다...',
    'loading.ready': '사이드바와 초기 데이터를 준비하고 있습니다.',
    'loading.slow': '초기 로딩이 예상보다 오래 걸리고 있습니다. 잠시 후 다시 열어보세요.',
    'git.refreshing': 'Git 상태를 새로고침하는 중...',
    'git.updatedAt': (params) => `${params?.time ?? ''}에 갱신됨`,
    'git.notRefreshed': '아직 새로고침되지 않음',
    'git.manualRefresh': '수동 새로고침',
    'git.noRepository': 'Git 저장소를 찾을 수 없습니다',
    'git.noRepositoryHelp': '.git 디렉터리가 포함된 프로젝트 폴더를 File > Open Folder...에서 열어주세요.',
    'git.currentBranchMissing': '저장소가 연결되지 않음',
    'git.switching': '전환 중...',
    'git.branchList.empty': '다른 로컬 브랜치가 없습니다.',
    'git.worktrees': (params) => `워크트리 (${params?.count ?? 0})`,
    'git.worktrees.empty': '추가 워크트리가 없습니다.',
    'git.detached': '(detached)',
    'git.current': '현재',
    'git.newBranch.title': '새 브랜치 만들기',
    'git.newBranch.placeholder': '새 브랜치 이름을 입력하세요',
    'git.newBranch.create': '생성',
    'git.newBranch.cancel': '취소',
    'git.newBranch.invalidWhitespace': '브랜치 이름에는 공백을 사용할 수 없습니다. 공백 없이 다시 입력해주세요.',
    'git.ai.suggest': 'AI 추천',
    'git.ai.suggesting': '추천 중...',
    'git.ai.close': '취소',
    'git.ai.submit': '전송',
    'git.ai.submitting': '생성 중...',
    'git.ai.promptBranch': '어떤 작업을 할 예정인지 입력하면 GitCat이 브랜치 이름을 추천합니다.',
    'git.ai.promptCommit': '무엇이 바뀌었는지 입력하면 GitCat이 커밋 메시지를 추천합니다.',
    'git.push': 'Git Push',
    'git.pushing': '푸시 중...',
    'git.pull': 'Git Pull',
    'git.pulling': '풀 중...',
    'git.pr.create': 'PR 생성',
    'git.pr.opening': '여는 중...',
    'git.merge': '머지',
    'git.merging': '머지 중...',
    'git.merge.title': '머지할 브랜치 선택',
    'git.merge.source': '소스 브랜치',
    'git.merge.sourcePlaceholder': '머지할 브랜치를 선택하세요',
    'git.merge.target': '대상 브랜치',
    'git.merge.run': '머지 실행',
    'git.cancel': '취소',
    'git.language.label': '언어',
    'git.language.current': (params) => `현재 언어: ${params?.value ?? ''}`,
    'git.language.auto': '자동',
    'git.language.english': '영어',
    'git.language.korean': '한국어',
    'git.merge.sameBranch': '같은 브랜치는 머지할 수 없습니다.',
    'git.commit.stageRequired': '파일을 먼저 stage한 뒤 커밋할 수 있습니다.',
    'snapshots.empty': '생성된 스냅샷이 없습니다.',
    'snapshots.createAuto': (params) => `수동 스냅샷 (${params?.time ?? ''})`,
    'snapshots.files': (params) => `${params?.count ?? 0}개 파일`,
    'snapshots.changedFilesEmpty': '변경된 파일이 없습니다.',
    'snapshots.restore': '이 시점으로 복원',
    'snapshots.viewAll': '전체 복원 기록 보기',
    'snapshots.diffDialog': '스냅샷 파일 diff',
    'snapshots.close': '닫기',
    'snapshots.restoreHistory': '복원 기록',
    'snapshots.restoreHistoryEmpty': '복원 기록이 없습니다.',
    'snapshots.restoreConfirm.title': '대량 복원 경고',
    'snapshots.restoreConfirm.body': (params) => `복원 시 ${params?.count ?? 0}개 경로가 변경됩니다. 아래 경고를 확인한 뒤 진행해주세요.`,
    'snapshots.restoreConfirm.cancel': '취소',
    'snapshots.restoreConfirm.confirm': '확인하고 복원',
    'relative.justNow': '방금 전',
    'relative.minutesAgo': (params) => `${params?.count ?? 0}분 전`,
    'relative.hoursAgo': (params) => `${params?.count ?? 0}시간 전`,
    'relative.daysAgo': (params) => `${params?.count ?? 0}일 전`,
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
