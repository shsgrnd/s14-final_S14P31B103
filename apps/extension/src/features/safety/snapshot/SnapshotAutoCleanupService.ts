import type { SnapshotRepository } from '@gitcat/shared-types';
import { SnapshotLocalStore } from './SnapshotLocalStore';

/**
 * Snapshot 자동 삭제 서비스
 *
 * 정책:
 * - 최근 N개를 초과하는 오래된 Snapshot을 삭제한다.
 * - 삭제 개수(N)는 SnapshotService의 SNAPSHOT_KEEP_RECENT_COUNT 상수로 제어한다.
 * - Local 파일 삭제 → DB 메타데이터 삭제 순서로 진행
 * - 삭제 실패 시 경고 로그만 남기고 계속 진행 (베스트 에포트)
 */
export class SnapshotAutoCleanupService {
  /** 자동 삭제 시 사용하는 기본 유지 개수 */
  private static readonly DEFAULT_KEEP_RECENT = 10;

  constructor(
    private readonly snapshotRepository: SnapshotRepository,
    private readonly localStore: SnapshotLocalStore,
  ) { }

  /**
   * 자동 정리를 실행한다.
   *
   * @param worktreeInstanceId 대상 워크트리 인스턴스 ID
   * @param keepRecent 유지할 최근 스냅샷 수 (기본 10)
   */
  async cleanup(
    worktreeInstanceId: string,
    keepRecent: number = SnapshotAutoCleanupService.DEFAULT_KEEP_RECENT,
  ): Promise<void> {
    let candidates;

    try {
      // 최근 N개 초과분을 오래된 순으로 조회
      candidates = await this.snapshotRepository.listAutoDeletionCandidates(
        worktreeInstanceId,
        keepRecent,
        50, // 한 번에 최대 50개까지 처리
      );
    } catch (error) {
      console.error('[SnapshotAutoCleanupService] 삭제 후보 조회 실패:', error);
      return;
    }

    if (candidates.length === 0) {
      return;
    }

    console.log(`[SnapshotAutoCleanupService] 자동 삭제 대상 ${candidates.length}개 발견`);

    // 각 Snapshot을 하나씩 삭제 (실패 시 다음으로 진행)
    for (const candidate of candidates) {
      await this.deleteOne(candidate.snapshot_id);
    }
  }

  /**
   * 단일 Snapshot의 Local 파일과 DB 메타데이터를 삭제한다.
   *
   * @param snapshotId 삭제할 스냅샷 ID
   */
  private async deleteOne(snapshotId: string): Promise<void> {
    // 1) Local 파일 삭제 (없어도 오류 아님)
    try {
      await this.localStore.deleteSnapshot(snapshotId);
    } catch (localError) {
      // 파일이 이미 없거나 삭제 실패해도 DB 정리는 계속 진행
      console.warn(
        `[SnapshotAutoCleanupService] 로컬 파일 삭제 실패 (snapshotId=${snapshotId}):`,
        localError,
      );
    }

    // 2) DB 메타데이터 삭제
    try {
      await this.snapshotRepository.deleteById(snapshotId);
      console.log(`[SnapshotAutoCleanupService] 스냅샷 삭제 완료: ${snapshotId}`);
    } catch (dbError) {
      // DB 삭제 실패는 경고만 남김
      console.error(
        `[SnapshotAutoCleanupService] DB 메타데이터 삭제 실패 (snapshotId=${snapshotId}):`,
        dbError,
      );
    }
  }
}
