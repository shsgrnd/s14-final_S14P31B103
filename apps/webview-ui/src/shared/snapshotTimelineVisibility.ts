import type { SnapshotMeta } from '@gitcat/shared-types';

/** 원복 직전 자동 백업(pre_restore) — DB에는 남지만 사이드바 타임라인·배지에서는 제외 */
export function snapshotsVisibleInSidebarTimeline(list: SnapshotMeta[]): SnapshotMeta[] {
  return list.filter((s) => s.type !== 'pre_restore');
}
