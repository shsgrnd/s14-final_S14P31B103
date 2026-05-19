import { getLocale } from '../i18n';

export type UiMessageTone = 'error' | 'warning' | 'info' | 'success';

type Rule = { test: (m: string) => boolean; ko: (m: string) => string; en: (m: string) => string };

const HAS_HANGUL = /[\uac00-\ud7a3]/i;

const RULES: Rule[] = [
  {
    test: (m) => /is not a valid branch name/i.test(m),
    ko: (m) => {
      const branch = m.match(/fatal:\s*'([^']+)'\s+is not a valid branch name/i)?.[1];
      return branch
        ? `브랜치 이름 '${branch}' 이(가) 올바르지 않습니다. 공백이나 특수문자를 확인해 주세요.`
        : '브랜치 이름이 올바르지 않습니다. 공백이나 특수문자를 확인해 주세요.';
    },
    en: (m) => {
      const branch = m.match(/fatal:\s*'([^']+)'\s+is not a valid branch name/i)?.[1];
      return branch
        ? `Branch name '${branch}' is not valid. Check spaces or special characters.`
        : 'Branch name is not valid. Check spaces or special characters.';
    },
  },
  {
    test: (m) =>
      /\[rejected\]\s*\(non-fast-forward\)/i.test(m) ||
      /updates were rejected because the tip of your current branch is behind/i.test(m) ||
      (/non-fast-forward/i.test(m) && /failed to push some refs/i.test(m)),
    ko: () =>
      'Push가 거부되었습니다. 현재 브랜치가 원격보다 뒤처져 있습니다. 먼저 Pull 또는 rebase 후 다시 Push해 주세요.',
    en: () =>
      'Push was rejected because your current branch is behind the remote branch. Pull or rebase first, then push again.',
  },
  {
    test: (m) => /couldn'?t find remote ref/i.test(m),
    ko: (m) => {
      const ref = m.match(/remote ref\s+([^\s]+)\s*$/i)?.[1];
      return ref
        ? `원격에서 '${ref}' 참조를 찾을 수 없습니다. 먼저 Push했는지, 업스트림이 올바른지 확인해 주세요.`
        : '원격 참조를 찾을 수 없습니다. 먼저 Push했는지, 업스트림이 올바른지 확인해 주세요.';
    },
    en: (m) => {
      const ref = m.match(/remote ref\s+([^\s]+)\s*$/i)?.[1];
      return ref
        ? `Remote ref '${ref}' was not found. Check whether it was pushed and whether the upstream is correct.`
        : 'Remote ref was not found. Check whether it was pushed and whether the upstream is correct.';
    },
  },
  {
    test: (m) => /needs merge/i.test(m) && /resolve your current index first/i.test(m),
    ko: () => '현재 인덱스에 병합되지 않은 변경이 있습니다. 먼저 충돌을 해결한 뒤 다시 시도해 주세요.',
    en: () => 'Your index still contains unresolved merge state. Resolve the current conflicts first and try again.',
  },
  {
    test: (m) => /please commit your changes or stash them/i.test(m),
    ko: () => '변경 사항을 커밋하거나 stash에 저장한 뒤 다시 시도해 주세요.',
    en: () => 'Commit your changes or stash them before trying again.',
  },
  {
    test: (m) =>
      /your local changes to the following files would be overwritten by checkout/i.test(m) ||
      /would be overwritten by checkout/i.test(m),
    ko: () => '현재 변경 사항이 브랜치 전환으로 덮어써집니다. 먼저 커밋하거나 stash에 저장해 주세요.',
    en: () => 'Your local changes would be overwritten by checkout. Commit or stash them first.',
  },
  {
    test: (m) =>
      /please commit your changes or stash them before you switch branches/i.test(m) ||
      /before you switch branches/i.test(m),
    ko: () => '브랜치를 바꾸기 전에 변경 사항을 커밋하거나 stash에 저장해 주세요.',
    en: () => 'Commit your changes or stash them before switching branches.',
  },
  {
    test: (m) => /would be overwritten by merge/i.test(m),
    ko: () => '현재 변경 사항이 Merge로 덮어써집니다. 먼저 커밋하거나 stash에 저장해 주세요.',
    en: () => 'Your local changes would be overwritten by merge. Commit or stash them first.',
  },
  {
    test: (m) => /\d+\s+file\(s\)\s+staged\.?/i.test(m),
    ko: (m) => `${m.match(/(\d+)/)?.[1] ?? ''}개 파일이 stage되었습니다.`.trim(),
    en: (m) => `${m.match(/(\d+)/)?.[1] ?? ''} file(s) staged.`.trim(),
  },
  {
    test: (m) => /\d+\s+file\(s\)\s+unstaged\.?/i.test(m),
    ko: (m) => `${m.match(/(\d+)/)?.[1] ?? ''}개 파일이 unstage되었습니다.`.trim(),
    en: (m) => `${m.match(/(\d+)/)?.[1] ?? ''} file(s) unstaged.`.trim(),
  },
];

const KNOWN_KO_TO_EN: Array<[RegExp, string | ((m: string) => string)]> = [
  [/병합 충돌이 발생했습니다\./, 'A merge conflict occurred.'],
  [/스냅샷이 생성되었습니다\./, 'Snapshot created.'],
  [/스냅샷이 삭제되었습니다\./, 'Snapshot deleted.'],
  [/복원이 완료되었습니다\./, 'Restore completed.'],
  [/브랜치 정리 설정이 저장되었습니다\./, 'Branch cleanup settings saved.'],
  [/저장된 stash가 없습니다\./, 'No saved stashes.'],
];

function translateKnownKoreanToEnglish(message: string): string {
  let out = message;
  for (const [pattern, replacement] of KNOWN_KO_TO_EN) {
    if (typeof replacement === 'function') {
      out = out.replace(pattern, (substring: string) => replacement(substring));
    } else {
      out = out.replace(pattern, replacement);
    }
  }
  return out;
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

  if (locale === 'en' && HAS_HANGUL.test(source)) {
    return translateKnownKoreanToEnglish(source);
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
