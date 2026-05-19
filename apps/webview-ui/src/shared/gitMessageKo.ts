import { getLocale, type Locale } from '../i18n';

export type UiMessageTone = 'error' | 'warning' | 'info' | 'success';

type Rule = {
  test: (message: string) => boolean;
  ko: (message: string) => string;
  en: (message: string) => string;
};

const HAS_HANGUL = /[\uac00-\ud7a3]/;

function extractCount(message: string): string {
  return message.match(/(\d+)/)?.[1] ?? '';
}

const RULES: Rule[] = [
  {
    test: (message) => /is not a valid branch name/i.test(message),
    ko: (message) => {
      const branch = message.match(/fatal:\s*'([^']+)'\s+is not a valid branch name/i)?.[1];
      return branch
        ? `브랜치 이름 '${branch}' 이(가) 올바르지 않습니다. 공백이나 특수문자를 확인해 주세요.`
        : '브랜치 이름이 올바르지 않습니다. 공백이나 특수문자를 확인해 주세요.';
    },
    en: (message) => {
      const branch = message.match(/fatal:\s*'([^']+)'\s+is not a valid branch name/i)?.[1];
      return branch
        ? `Branch name '${branch}' is not valid. Check spaces or special characters.`
        : 'Branch name is not valid. Check spaces or special characters.';
    },
  },
  {
    test: (message) =>
      /\[rejected\]\s*\(non-fast-forward\)/i.test(message) ||
      /updates were rejected because the tip of your current branch is behind/i.test(message) ||
      (/non-fast-forward/i.test(message) && /failed to push some refs/i.test(message)),
    ko: () =>
      'Push가 거부되었습니다. 현재 브랜치가 원격 브랜치보다 뒤쳐져 있습니다. 먼저 Pull 또는 rebase 후 다시 Push해 주세요.',
    en: () =>
      'Push was rejected because your current branch is behind the remote branch. Pull or rebase first, then push again.',
  },
  {
    test: (message) => /couldn'?t find remote ref/i.test(message),
    ko: (message) => {
      const ref = message.match(/remote ref\s+([^\s]+)\s*$/i)?.[1];
      return ref
        ? `원격에서 '${ref}' 참조를 찾을 수 없습니다. 먼저 Push했는지, 업스트림이 올바른지 확인해 주세요.`
        : '원격 참조를 찾을 수 없습니다. 먼저 Push했는지, 업스트림이 올바른지 확인해 주세요.';
    },
    en: (message) => {
      const ref = message.match(/remote ref\s+([^\s]+)\s*$/i)?.[1];
      return ref
        ? `Remote ref '${ref}' was not found. Check whether it was pushed and whether the upstream is correct.`
        : 'Remote ref was not found. Check whether it was pushed and whether the upstream is correct.';
    },
  },
  {
    test: (message) => /needs merge/i.test(message) && /resolve your current index first/i.test(message),
    ko: () => '현재 인덱스에 병합되지 않은 변경 사항이 있습니다. 먼저 충돌을 해결한 뒤 다시 시도해 주세요.',
    en: () => 'Your index still contains unresolved merge state. Resolve the current conflicts first and try again.',
  },
  {
    test: (message) => /please commit your changes or stash them/i.test(message),
    ko: () => '변경 사항을 커밋하거나 stash한 뒤 다시 시도해 주세요.',
    en: () => 'Commit your changes or stash them before trying again.',
  },
  {
    test: (message) =>
      /your local changes to the following files would be overwritten by checkout/i.test(message) ||
      /would be overwritten by checkout/i.test(message),
    ko: () => '현재 변경 사항이 브랜치 전환으로 덮어써집니다. 먼저 커밋하거나 stash해 주세요.',
    en: () => 'Your local changes would be overwritten by checkout. Commit or stash them first.',
  },
  {
    test: (message) =>
      /please commit your changes or stash them before you switch branches/i.test(message) ||
      /before you switch branches/i.test(message),
    ko: () => '브랜치를 바꾸기 전에 변경 사항을 커밋하거나 stash해 주세요.',
    en: () => 'Commit your changes or stash them before switching branches.',
  },
  {
    test: (message) => /would be overwritten by merge/i.test(message),
    ko: () => '현재 변경 사항이 Merge로 덮어써집니다. 먼저 커밋하거나 stash해 주세요.',
    en: () => 'Your local changes would be overwritten by merge. Commit or stash them first.',
  },
  {
    test: (message) => /\d+\s+file\(s\)\s+staged\.?/i.test(message),
    ko: (message) => `${extractCount(message)}개 파일을 stage 했습니다.`,
    en: (message) => `${extractCount(message)} file(s) staged.`,
  },
  {
    test: (message) => /\d+\s+file\(s\)\s+unstaged\.?/i.test(message),
    ko: (message) => `${extractCount(message)}개 파일을 unstage 했습니다.`,
    en: (message) => `${extractCount(message)} file(s) unstaged.`,
  },
];

const KNOWN_MESSAGES: Array<{
  test: (message: string) => boolean;
  ko: (message: string) => string;
  en: (message: string) => string;
}> = [
  {
    test: (message) => message.includes('모든 변경사항이 스테이징되었습니다.') || message.includes('All changes have been staged.'),
    ko: () => '모든 변경사항이 스테이징되었습니다.',
    en: () => 'All changes have been staged.',
  },
  {
    test: (message) => message.includes('스냅샷 이름 변경은 아직 지원되지 않습니다.') || message.includes('Snapshot rename is not available yet.'),
    ko: () => '스냅샷 이름 변경은 아직 지원되지 않습니다.',
    en: () => 'Snapshot rename is not available yet.',
  },
  {
    test: (message) => message.includes('브랜치 정리 설정이 저장되었습니다.') || message.includes('Branch cleanup settings saved.'),
    ko: () => '브랜치 정리 설정이 저장되었습니다.',
    en: () => 'Branch cleanup settings saved.',
  },
  {
    test: (message) => message.includes('저장된 stash가 없습니다.') || message.includes('No saved stashes.'),
    ko: () => '저장된 stash가 없습니다.',
    en: () => 'No saved stashes.',
  },
  {
    test: (message) => message.includes('스냅샷이 생성되었습니다') || message.includes('Snapshot created'),
    ko: () => '스냅샷이 생성되었습니다.',
    en: () => 'Snapshot created.',
  },
  {
    test: (message) => message.includes('스냅샷이 삭제되었습니다') || message.includes('Snapshot deleted'),
    ko: () => '스냅샷이 삭제되었습니다.',
    en: () => 'Snapshot deleted.',
  },
  {
    test: (message) => message.includes('복원이 완료되었습니다') || message.includes('Restore completed'),
    ko: () => '복원이 완료되었습니다.',
    en: () => 'Restore completed.',
  },
  {
    test: (message) => message.includes('병합 충돌이 발생했습니다') || message.includes('merge conflict occurred'),
    ko: () => '병합 충돌이 발생했습니다.',
    en: () => 'A merge conflict occurred.',
  },
  {
    test: (message) => message.includes('PR 패널이 열렸습니다.'),
    ko: () => 'PR 패널이 열렸습니다. base branch를 선택하면 PR description 추천이 시작됩니다.',
    en: () => 'The PR panel has opened. PR description suggestions will start after you select a base branch.',
  },
  {
    test: (message) => message.includes('Snapshot renamed: '),
    ko: (message) => {
      const title = message.replace('Snapshot renamed: ', '').trim();
      return title ? `스냅샷 이름이 변경되었습니다: ${title}` : '스냅샷 이름이 변경되었습니다.';
    },
    en: (message) => message,
  },
];

function translateKnownMessage(message: string, locale: Locale): string | null {
  const matched = KNOWN_MESSAGES.find((rule) => rule.test(message));
  if (!matched) return null;
  return locale === 'ko' ? matched.ko(message) : matched.en(message);
}

export function translateUserFacingGitMessage(
  raw: string | undefined | null,
  tone: UiMessageTone = 'error',
): string {
  if (raw == null) return '';
  const source = String(raw).trim();
  if (!source) return '';

  const locale = getLocale();
  for (const rule of RULES) {
    if (rule.test(source)) {
      return locale === 'ko' ? rule.ko(source) : rule.en(source);
    }
  }

  const known = translateKnownMessage(source, locale);
  if (known) {
    return known;
  }

  if (locale === 'ko' && HAS_HANGUL.test(source)) {
    return source;
  }

  if (tone === 'error') {
    return locale === 'ko'
      ? `작업 중 문제가 발생했습니다: ${source}`
      : `An error occurred while running the Git operation: ${source}`;
  }

  if (tone === 'warning') {
    return locale === 'ko'
      ? `확인이 필요한 내용입니다: ${source}`
      : `Please review this message: ${source}`;
  }

  return source;
}
