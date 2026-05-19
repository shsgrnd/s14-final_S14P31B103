import type { SidebarSectionKey } from './useSidebarSectionWeights';

/** 사이드바 섹션 표시 순서 (위 → 아래) */
export const SIDEBAR_SECTION_ORDER: readonly SidebarSectionKey[] = [
  'git',
  'filetree',
  'safety',
  'branch',
  'stash',
] as const;

export const SIDEBAR_SECTION_LABEL: Record<SidebarSectionKey, string> = {
  git: 'Git & AI',
  filetree: 'Files',
  safety: 'Snapshots',
  branch: 'Branch Cleanup',
  stash: 'Git Stash',
};

export type SidebarSectionExpanded = Record<SidebarSectionKey, boolean>;

export const DEFAULT_SIDEBAR_SECTION_EXPANDED: SidebarSectionExpanded = {
  git: true,
  filetree: true,
  safety: false,
  branch: false,
  stash: false,
};

/**
 * `key` 아래쪽에서 다음으로 펼쳐진 섹션을 찾는다.
 * 접힌 섹션은 건너뛰어, 열린 패널끼리만 리사이즈 핸들을 연결할 때 사용한다.
 */
export function getNextExpandedSection(
  key: SidebarSectionKey,
  expanded: SidebarSectionExpanded,
): SidebarSectionKey | null {
  const start = SIDEBAR_SECTION_ORDER.indexOf(key);
  if (start < 0) return null;
  for (let i = start + 1; i < SIDEBAR_SECTION_ORDER.length; i++) {
    const next = SIDEBAR_SECTION_ORDER[i];
    if (expanded[next]) return next;
  }
  return null;
}
