import type { SnapshotCreationType } from './ISnapshotService';

/**
 * SnapshotId 생성 유틸리티
 *
 * 형식: snap_{typeSlug}_{timestamp}_{random6}
 * 예:   snap_ai-result_1715597627341_x3k9mz
 *
 * SnapshotLocalStore.assertValidSnapshotId()는 [A-Za-z0-9._-] 문자셋만 허용하므로
 * type 내 언더스코어(_)는 하이픈(-)으로 변환한다.
 */
export class SnapshotIdGenerator {
  /**
   * 고유한 snapshotId를 생성한다.
   *
   * @param type 스냅샷 생성 유형 (예: 'ai_result', 'pre_restore')
   * @returns snapshotId 문자열
   */
  static generate(type: SnapshotCreationType): string {
    // SnapshotLocalStore 허용 문자셋: [A-Za-z0-9._-]
    // type의 '_'를 '-'로 치환하여 ID에 사용
    const typeSlug = type.replace(/_/g, '-');
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8); // 6자리 랜덤 base36

    return `snap_${typeSlug}_${timestamp}_${random}`;
  }

  /**
   * 세션 식별자를 생성한다. (DB work_sessions 테이블의 fallback ID로 사용)
   *
   * @param prefix 세션 종류 접두사 (예: 'fallback', 'ai', 'manual')
   * @returns session ID 문자열
   */
  static generateSessionId(prefix: string = 'fallback'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}_session_${timestamp}_${random}`;
  }

  /**
   * worktreeInstance 식별자를 생성한다.
   * MVP에서 worktreeInstanceId가 없는 경우 rootPath hash 기반으로 결정론적 ID를 사용한다.
   *
   * @param seed 결정론적 ID 생성을 위한 시드 값 (보통 rootPath)
   * @returns worktreeInstance ID 문자열
   */
  static generateWorktreeInstanceId(seed: string): string {
    // 간단한 해시: 문자 코드의 합산 후 16진수 표현
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
    }
    const hexHash = Math.abs(hash).toString(16).padStart(8, '0');
    return `fallback_wti_${hexHash}`;
  }
}
