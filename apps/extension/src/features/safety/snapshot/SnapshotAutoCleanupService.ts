import type { SnapshotRepository, SnapshotRow } from '@gitcat/shared-types';
import { SnapshotLocalStore } from './SnapshotLocalStore';

export interface SnapshotCleanupPolicy {
  keepRecent: number;
  keepRecentPreRestore: number;
  maxDeletePerRun?: number;
}

/**
 * Snapshot 자동 정리 서비스
 *
 * 정책:
 * - 일반 snapshot과 pre_restore snapshot을 분리해서 보관 개수를 계산한다.
 * - 삭제는 "로컬 임시 격리 -> DB metadata 삭제 -> 로컬 최종 삭제" 순서로 수행한다.
 * - DB 삭제 실패 시 로컬 디렉터리를 원래 위치로 복구해 불일치를 최소화한다.
 */
export class SnapshotAutoCleanupService {
  static readonly DEFAULT_KEEP_RECENT = 10;
  static readonly DEFAULT_KEEP_RECENT_PRE_RESTORE = 3;
  private static readonly DEFAULT_MAX_DELETE_PER_RUN = 50;

  constructor(
    private readonly snapshotRepository: SnapshotRepository,
    private readonly localStore: SnapshotLocalStore,
  ) {}

  async cleanup(
    worktreeInstanceId: string,
    policy: number | SnapshotCleanupPolicy = SnapshotAutoCleanupService.DEFAULT_KEEP_RECENT,
  ): Promise<void> {
    const resolvedPolicy = this.normalizePolicy(policy);
    const rows = await this.snapshotRepository.listByWorkspace(
      worktreeInstanceId,
      resolvedPolicy.keepRecent + resolvedPolicy.keepRecentPreRestore + 500,
    );
    const candidates = this.selectDeletionCandidates(rows, resolvedPolicy);

    if (candidates.length === 0) {
      return;
    }

    console.log(`[SnapshotAutoCleanupService] 자동 삭제 대상 ${candidates.length}개 발견`);

    for (const candidate of candidates) {
      await this.deleteSnapshot(candidate.snapshot_id);
    }
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    const trashHandle = await this.localStore.moveSnapshotToTrash(snapshotId);

    try {
      await this.snapshotRepository.deleteById(snapshotId);
    } catch (dbError) {
      if (trashHandle) {
        try {
          await this.localStore.restoreSnapshotFromTrash(trashHandle);
        } catch (restoreError) {
          console.error(
            `[SnapshotAutoCleanupService] DB 삭제 실패 후 로컬 복구도 실패했습니다 (snapshotId=${snapshotId}):`,
            restoreError,
          );
        }
      }
      throw dbError;
    }

    if (!trashHandle) {
      return;
    }

    try {
      await this.localStore.deleteTrashedSnapshot(trashHandle);
    } catch (localError) {
      console.error(
        `[SnapshotAutoCleanupService] DB 삭제 후 trash 정리 실패 (snapshotId=${snapshotId}):`,
        localError,
      );
    }
  }

  private normalizePolicy(policy: number | SnapshotCleanupPolicy): Required<SnapshotCleanupPolicy> {
    if (typeof policy === 'number') {
      return {
        keepRecent: Math.max(0, policy),
        keepRecentPreRestore: SnapshotAutoCleanupService.DEFAULT_KEEP_RECENT_PRE_RESTORE,
        maxDeletePerRun: SnapshotAutoCleanupService.DEFAULT_MAX_DELETE_PER_RUN,
      };
    }

    return {
      keepRecent: Math.max(0, policy.keepRecent),
      keepRecentPreRestore: Math.max(0, policy.keepRecentPreRestore),
      maxDeletePerRun: Math.max(1, policy.maxDeletePerRun ?? SnapshotAutoCleanupService.DEFAULT_MAX_DELETE_PER_RUN),
    };
  }

  private selectDeletionCandidates(
    rows: SnapshotRow[],
    policy: Required<SnapshotCleanupPolicy>,
  ): SnapshotRow[] {
    const regularRows = rows.filter((row) => row.type !== 'pre_restore');
    const preRestoreRows = rows.filter((row) => row.type === 'pre_restore');

    const regularCandidates = this.takeOverflow(regularRows, policy.keepRecent);
    const preRestoreCandidates = this.takeOverflow(preRestoreRows, policy.keepRecentPreRestore);

    return [...regularCandidates, ...preRestoreCandidates]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, policy.maxDeletePerRun);
  }

  private takeOverflow(rows: SnapshotRow[], keepCount: number): SnapshotRow[] {
    if (rows.length <= keepCount) {
      return [];
    }

    return rows.slice(keepCount).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
}
