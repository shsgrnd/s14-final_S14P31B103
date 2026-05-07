export type UiMessageTone = 'error' | 'warning' | 'info' | 'success';

type Rule = { test: (m: string) => boolean; to: (m: string) => string };

const HAS_HANGUL = /[\uAC00-\uD7A3]/;

const RULES: Rule[] = [
  {
    test: (m) => /couldn'?t find remote ref/i.test(m),
    to: (m) => {
      const match = m.match(/remote ref\s+([^\s]+)\s*$/i);
      const ref = match?.[1];
      return ref
        ? `원격(origin)에 '${ref}' 브랜치가 없습니다. 아직 push하지 않았거나 upstream이 설정되지 않았을 수 있어요. 먼저 'Git Push'로 원격 브랜치를 만든 뒤 다시 Pull해 주세요.`
        : `원격(origin)에 해당 브랜치가 없습니다. 아직 push하지 않았거나 upstream이 설정되지 않았을 수 있어요. 먼저 'Git Push'로 원격 브랜치를 만든 뒤 다시 Pull해 주세요.`;
    },
  },
  {
    test: (m) => /needs merge/i.test(m) && /resolve your current index first/i.test(m),
    to: (m) => {
      const head = m.split(':')[0]?.trim() ?? '';
      const prefix = head && !/^error$/i.test(head) ? `${head}: ` : '';
      return `${prefix}머지가 필요한 상태입니다. 스테이징 영역(인덱스)의 충돌을 먼저 해결한 뒤 다시 시도해 주세요.`;
    },
  },
  {
    test: (m) => /please commit your changes or stash them/i.test(m),
    to: () => '커밋하지 않은 변경이 있습니다. 커밋하거나 stash한 뒤 다시 시도해 주세요.',
  },
  {
    test: (m) => /would be overwritten by merge/i.test(m),
    to: () => '로컬 변경 때문에 머지 시 덮어쓰일 수 있습니다. 변경을 커밋·stash·되돌린 뒤 다시 시도해 주세요.',
  },
  {
    test: (m) => /\d+\s+file\(s\)\s+staged\.?/i.test(m),
    to: (m) => {
      const n = m.match(/(\d+)/)?.[1];
      return n ? `${n}개 파일을 스테이징했습니다.` : '파일을 스테이징했습니다.';
    },
  },
  {
    test: (m) => /\d+\s+file\(s\)\s+unstaged\.?/i.test(m),
    to: (m) => {
      const n = m.match(/(\d+)/)?.[1];
      return n ? `${n}개 파일의 스테이징을 해제했습니다.` : '스테이징을 해제했습니다.';
    },
  },
];

export function translateUserFacingGitMessage(
  raw: string | undefined | null,
  tone: UiMessageTone = 'error',
): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';

  for (const r of RULES) {
    if (r.test(s)) return r.to(s);
  }

  if (HAS_HANGUL.test(s)) return s;

  if (tone === 'error') return `작업 중 오류가 발생했습니다: ${s}`;
  if (tone === 'warning') return `다음 내용을 확인해 주세요: ${s}`;
  return s;
}

