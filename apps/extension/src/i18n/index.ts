import * as vscode from 'vscode';

export type Locale = 'en' | 'ko';
type LocaleSetting = Locale | 'auto';
type MessageValue = string | ((params?: Record<string, string | number>) => string);

const DEFAULT_LOCALE: Locale = 'en';

function resolveAutoLocale(): Locale {
  return vscode.env.language.toLowerCase().startsWith('ko') ? 'ko' : DEFAULT_LOCALE;
}

const messages: Record<Locale, Record<string, MessageValue>> = {
  en: {
    'workspace.openFolderFirst': 'GitCat: Open a workspace folder to get started.',
    'workspace.changedReloadRequired': 'GitCat: Workspace folders changed. Reload the window to apply the change.',
    'git.init.failed': 'GitCat Git features could not be initialized.',
    'github.pr.init.failed': 'GitCat GitHub PR features could not be initialized.',
    'database.init.failed': 'GitCat local database could not be initialized.',
    'safety.init.failed': 'GitCat Safety Layer could not be initialized. Snapshot features will be limited.',
    'recommendation.init.failed': (params) => `GitCat recommendation features were delayed or failed to initialize: ${params?.message ?? ''}`,
    'recommendation.init.banner': 'GitCat recommendation features are not ready yet, so some AI features may be limited.',
    'snapshot.create.title': 'GitCat: Create Snapshot',
    'snapshot.create.prompt': 'Optional snapshot title or reason',
    'snapshot.create.placeholder': 'Manual snapshot before refactor',
    'snapshot.create.cancelled': 'GitCat: Snapshot creation cancelled.',
    'snapshot.create.skipped': 'GitCat: Snapshot was skipped because a restore is already in progress.',
    'snapshot.create.success': (params) => `GitCat: Snapshot created (${params?.snapshotId ?? ''}).`,
    'session.reason.default': 'Session completed',
    'session.reason.timeout': 'Session timed out',
    'session.snapshot.autoDirtyBeforeAi': 'Auto-protection snapshot before AI session for pending user changes',
    'session.snapshot.autoDirtyCurrentBeforeAi': 'Auto-protection snapshot before AI session for current dirty files',
    'session.snapshot.manual': 'Manual snapshot',
    'githubToken.input.title': 'GitCat: Set GitHub Token',
    'githubToken.input.prompt': 'Enter a GitHub Personal Access Token. It is stored only in SecretStorage.',
    'githubToken.input.validation': 'Enter a GitHub token.',
    'githubToken.saved': 'GitCat: GitHub token saved.',
    'githubToken.cleared': 'GitCat: GitHub token cleared.',
    'runtime.localModelPathRequired': 'GitCat live-local mode needs a GGUF model path. Set `GitCat > AI: Local Model Path` first.',
    'runtime.installPrompt': 'GitCat live-local runtime is not installed yet. Run `GitCat: Install Local Runtime` from the Command Palette or use the button below.',
    'runtime.installAction': 'Install Runtime',
    'runtime.installStarted': 'GitCat live-local runtime installation started in the terminal. Run the AI feature again after it finishes.',
  },
  ko: {
    'workspace.openFolderFirst': 'GitCat: 작업할 폴더를 먼저 열어주세요.',
    'workspace.changedReloadRequired': 'GitCat: 작업 폴더가 변경되었습니다. 창을 다시 로드해주세요.',
    'git.init.failed': 'GitCat Git 기능 초기화에 실패했습니다.',
    'github.pr.init.failed': 'GitCat GitHub PR 기능 초기화에 실패했습니다.',
    'database.init.failed': 'GitCat 로컬 데이터베이스를 초기화하지 못했습니다.',
    'safety.init.failed': 'GitCat Safety Layer 초기화에 실패했습니다. 스냅샷 기능이 제한됩니다.',
    'recommendation.init.failed': (params) => `GitCat 추천 기능 초기화가 지연되거나 실패했습니다: ${params?.message ?? ''}`,
    'recommendation.init.banner': 'GitCat 추천 기능이 아직 준비되지 않아 일부 AI 기능이 제한될 수 있습니다.',
    'snapshot.create.title': 'GitCat: 스냅샷 생성',
    'snapshot.create.prompt': '선택 사항: 스냅샷 제목 또는 이유',
    'snapshot.create.placeholder': '리팩터링 전 수동 스냅샷',
    'snapshot.create.cancelled': 'GitCat: 스냅샷 생성이 취소되었습니다.',
    'snapshot.create.skipped': 'GitCat: 복원 작업이 진행 중이어서 스냅샷 생성을 건너뛰었습니다.',
    'snapshot.create.success': (params) => `GitCat: 스냅샷이 생성되었습니다 (${params?.snapshotId ?? ''}).`,
    'session.reason.default': '세션 종료',
    'session.reason.timeout': '세션 시간 초과',
    'session.snapshot.autoDirtyBeforeAi': 'AI 작업 시작 전 사용자 변경 사항 자동 보호 스냅샷',
    'session.snapshot.autoDirtyCurrentBeforeAi': 'AI 작업 시작 전 현재 dirty 상태 자동 보호 스냅샷',
    'session.snapshot.manual': '수동 스냅샷',
    'githubToken.input.title': 'GitCat: GitHub 토큰 설정',
    'githubToken.input.prompt': 'GitHub Personal Access Token을 입력하세요. SecretStorage에만 저장됩니다.',
    'githubToken.input.validation': 'GitHub 토큰을 입력해주세요.',
    'githubToken.saved': 'GitCat: GitHub 토큰이 저장되었습니다.',
    'githubToken.cleared': 'GitCat: GitHub 토큰이 삭제되었습니다.',
    'runtime.localModelPathRequired': 'GitCat live-local 모드에는 GGUF 모델 경로가 필요합니다. `GitCat > AI: Local Model Path`를 먼저 설정해주세요.',
    'runtime.installPrompt': 'GitCat live-local 런타임이 아직 설치되지 않았습니다. Command Palette에서 `GitCat: Install Local Runtime`을 실행하거나 아래 버튼으로 설치를 시작해주세요.',
    'runtime.installAction': '런타임 설치',
    'runtime.installStarted': 'GitCat live-local 런타임 설치 명령을 터미널에서 시작했습니다. 설치가 끝나면 AI 기능을 다시 실행해주세요.',
  },
};

export function resolveLocale(): Locale {
  const setting = getLanguageSetting();
  if (setting === 'en' || setting === 'ko') {
    return setting;
  }

  return resolveAutoLocale();
}

export function getLanguageSetting(): LocaleSetting {
  const config = vscode.workspace.getConfiguration('gitcat');
  return (config.get<string>('language') ?? 'auto') as LocaleSetting;
}

export function t(key: string, params?: Record<string, string | number>, locale = resolveLocale()): string {
  const localized = messages[locale][key] ?? messages[DEFAULT_LOCALE][key] ?? key;
  return typeof localized === 'function' ? localized(params) : localized;
}

export function getWebviewLocaleBootstrapScript(viewMode?: string): string {
  const locale = resolveLocale();
  const autoLocale = resolveAutoLocale();
  const languageSetting = getLanguageSetting();
  const viewModeScript = viewMode ? `window.VIEW_MODE = ${JSON.stringify(viewMode)};` : '';
  return `<script>window.GITCAT_LOCALE = ${JSON.stringify(locale)};window.GITCAT_AUTO_LOCALE = ${JSON.stringify(autoLocale)};window.GITCAT_LANGUAGE_SETTING = ${JSON.stringify(languageSetting)};${viewModeScript}</script>`;
}
