import * as path from 'path';
import type {
  SnapshotRepository,
  SnapshotFileRepository,
  WorkSessionRepository,
  SnapshotManifest,
  SnapshotFile,
  SnapshotRow,
} from '@gitcat/shared-types';
import {
  getSnapshotSummarySystemPrompt,
  buildSnapshotSummaryUserPrompt,
} from '@gitcat/ai-pipeline';
import type { AiClient } from '@gitcat/ai-pipeline';
import { ISnapshotService, SnapshotCreationType, CreateSnapshotOptions } from './ISnapshotService';
import { SnapshotDiffService } from './SnapshotDiffService';
import { SnapshotLocalStore } from './SnapshotLocalStore';
import { SnapshotIdGenerator } from './SnapshotIdGenerator';
import { SnapshotAutoCleanupService } from './SnapshotAutoCleanupService';

/**
 * 스냅샷 타입 중 AI가 수행한 작업으로 분류되는 타입 목록입니다.
 *
 * 이 목록에 포함된 타입으로 생성된 스냅샷은 AI 요약 제목 앞에 [AI] 태그가 붙습니다.
 * 그 외의 타입(savepoint, auto_dirty_before_ai 등)은 [Human] 태그가 붙습니다.
 */
const AI_SNAPSHOT_TYPES: ReadonlySet<SnapshotCreationType> = new Set([
  'ai_result',       // AI가 코드 변경 작업을 완료한 뒤 찍히는 스냅샷
  'ai_pre_action',   // AI가 작업을 시작하기 직전 찍히는 스냅샷
]);

/**
 * 스냅샷 자동 삭제 정책: 최근 N개 초과 시 오래된 스냅샷을 삭제한다.
 * 이 값을 수정하면 보관 개수 정책이 즉시 반영된다.
 */
export const SNAPSHOT_KEEP_RECENT_COUNT = 10;

/**
 * 스냅샷 생성 최소 변경 줄 수
 *
 * diff 결과의 추가(+)/삭제(-) 줄 합계가 이 값 미만이면 스냅샷을 생성하지 않는다.
 * 단순 커서 이동 등 의도 없는 변경을 필터링하기 위한 값이다.
 */
export const SNAPSHOT_MIN_CHANGED_LINES = 5;

/**
 * SnapshotService 생성 옵션
 */
export interface SnapshotServiceOptions {
  /**
   * 대상 워크스페이스 루트 경로
   * - diff 계산 기준 디렉터리
   * - 로컬 파일 저장 기준 경로 (.vscode/gitcat/snapshots)
   */
  workspaceRoot: string;

  /**
   * 이 워크스페이스에 대응하는 worktreeInstanceId
   * - 없으면 workspaceRoot 해시 기반 fallback ID를 사용
   */
  worktreeInstanceId?: string;

  /**
   * 자동 삭제 정책: 최근 N개 유지 (기본값 SNAPSHOT_KEEP_RECENT_COUNT)
   * 개수를 바꾸려면 SNAPSHOT_KEEP_RECENT_COUNT 상수를 수정하거나 이 값을 직접 전달한다.
   */
  keepRecentCount?: number;

  /**
   * AI 요약 기능을 위한 AiClient 인스턴스.
   * 제공되지 않으면 스냅샷 이름 자동 생성이 비활성화된다.
   */
  aiClient?: AiClient;

  /**
   * AI 요약 완료 후 UI에 알리기 위한 브로드캐스트 콜백.
   * aiClient와 함께 제공해야 SNAPSHOT_UPDATED 이벤트가 전송된다.
   */
  onSnapshotUpdated?: (row: SnapshotRow) => void;

  keepRecentPreRestoreCount?: number;
}

/**
 * GitCat Safety Layer의 핵심 Snapshot 생성 서비스
 *
 * 역할:
 * 1. SnapshotType별 생성 흐름 제공 (F-25, F-26)
 * 2. SnapshotDiffService를 통한 AI diff / user diff 분리 계산
 * 3. SnapshotLocalStore를 통한 로컬 파일 저장
 *    - patch.diff    : 주 변경 diff
 *    - ai_patch.diff : AI 변경분만
 *    - user_patch.diff: 사용자 변경분만
 * 4. SnapshotRepository를 통한 DB 메타데이터 저장
 * 5. 실패 시 Local ↔ DB 불일치 방지 (rollback 시도)
 * 6. 생성 후 자동 삭제 정책 적용 (최근 N개 유지)
 * 7. [Task 45] 스냅샷 생성 직후 백그라운드에서 AI 요약 제목 자동 생성
 *    - aiClient가 주입된 경우에만 동작하며, 실패해도 스냅샷 생성 결과에 영향 없음
 *    - 스냅샷 타입에 따라 [AI] 또는 [Human] 접두사를 붙여 DB에 저장
 */
export class SnapshotService implements ISnapshotService {
  private readonly localStore: SnapshotLocalStore;
  private readonly diffService: SnapshotDiffService;
  private readonly cleanupService: SnapshotAutoCleanupService;
  private readonly workspaceRoot: string;
  private readonly worktreeInstanceId: string;
  private readonly keepRecentCount: number;
  /** AI 요약 호출에 사용되는 AiClient 인스턴스. 제공되지 않으면 AI 요약 기능이 비활성화됨 */
  private readonly aiClient?: AiClient;
  /** AI 요약 완료 후 웹뷰에 SNAPSHOT_UPDATED 이벤트를 전송하기 위한 콜백 */
  private readonly onSnapshotUpdated?: (row: SnapshotRow) => void;
  private readonly keepRecentPreRestoreCount: number;

  constructor(
    private readonly snapshotRepository: SnapshotRepository,
    private readonly snapshotFileRepository: SnapshotFileRepository,
    private readonly workSessionRepository: WorkSessionRepository,
    options: SnapshotServiceOptions,
  ) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.localStore = new SnapshotLocalStore(this.workspaceRoot);
    this.diffService = new SnapshotDiffService();
    this.keepRecentCount = options.keepRecentCount ?? SNAPSHOT_KEEP_RECENT_COUNT;
    this.aiClient = options.aiClient;
    this.onSnapshotUpdated = options.onSnapshotUpdated;
    this.keepRecentPreRestoreCount =
      options.keepRecentPreRestoreCount ??
      SnapshotAutoCleanupService.DEFAULT_KEEP_RECENT_PRE_RESTORE;

    this.worktreeInstanceId =
      options.worktreeInstanceId ??
      SnapshotIdGenerator.generateWorktreeInstanceId(this.workspaceRoot);

    this.cleanupService = new SnapshotAutoCleanupService(snapshotRepository, this.localStore);
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    const existing = await this.snapshotRepository.findById(snapshotId);
    if (!existing) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    await this.cleanupService.deleteSnapshot(snapshotId);
    console.log(`[SnapshotService] 스냅샷 삭제 완료: ${snapshotId}`);
  }

  /**
   * 지정한 타입의 Snapshot을 생성한다.
   *
   * @param type 스냅샷 생성 유형
   * @param options 변경 파일 목록, 베이스라인, 이유, 세션 ID 등
   * @returns 생성된 snapshotId, 실패 시 undefined
   */
  async createSnapshot(
    type: SnapshotCreationType,
    options: CreateSnapshotOptions = {},
  ): Promise<string | undefined> {
    const snapshotId = SnapshotIdGenerator.generate(type);
    const createdAt = new Date().toISOString();

    console.log(`[SnapshotService] 스냅샷 생성 시작: type=${type}, id=${snapshotId}`);

    // --- AI 변경 diff 계산 ---
    // baselines(AI 세션 시작 시점) → 현재 파일 상태 diff
    let diffResult;
    try {
      diffResult = await this.buildDiff(options.baselines, options.changedFiles);
    } catch (diffError) {
      console.error('[SnapshotService] diff 생성 실패:', diffError);
      return undefined;
    }

    const { patchText, hunks, changedFiles, warnings } = diffResult;

    // --- 저장 조건 체크 ---
    if (type === 'savepoint') {
      // 세이브포인트: 변경 파일이 0개면 저장하지 않음 (줄 수 제한 없음)
      if (changedFiles.length === 0) {
        console.log('[SnapshotService] 변경된 파일 없음 → 세이브포인트 생략');
        return undefined;
      }
    } else {
      // 자동 스냅샷: 변경 줄 수가 최소 기준 미만이면 생략
      const totalChangedLines = this.countChangedLines(patchText);
      if (totalChangedLines < SNAPSHOT_MIN_CHANGED_LINES) {
        console.log(
          `[SnapshotService] 변경 줄 수 부족 → 스냅샷 생략 ` +
          `(${totalChangedLines}줄 < ${SNAPSHOT_MIN_CHANGED_LINES}줄, type=${type})`,
        );
        return undefined;
      }
    }

    // --- 사용자 변경 diff 계산 (있는 경우) ---
    // userBaselines(직전 AI 세션 종료 시점) → 현재 파일 상태 diff
    let userPatchText: string | undefined;
    if (options.userBaselines && options.userBaselines.size > 0) {
      try {
        const userDiff = await this.buildDiff(options.userBaselines, options.userChangedFiles ?? []);
        userPatchText = userDiff.patchText;
      } catch (userDiffError) {
        // user diff 실패는 경고만 남기고 계속 진행
        console.warn('[SnapshotService] user diff 생성 실패 (무시):', userDiffError);
      }
    }

    // --- Manifest 구성 ---
    const manifest: SnapshotManifest = {
      snapshotId,
      type,
      createdAt,
      reason: options.reason,
      summary: options.summary,
      changedFiles,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    // --- Local 파일 저장 ---
    // ai_result: ai_patch.diff (AI 변경) + user_patch.diff (직전 사용자 변경)
    // auto_dirty_before_ai: user_patch.diff (사용자 변경) 단독
    const isAiResult = type === 'ai_result' || type === 'ai_pre_action';
    const storeResult = await this.localStore.saveSnapshotArtifact({
      manifest,
      patchText,
      hunks,
      aiPatchText: isAiResult ? patchText : undefined,
      userPatchText,
    });

    if (!storeResult.ok) {
      console.error(
        `[SnapshotService] 로컬 파일 저장 실패 (snapshotId=${snapshotId}):`,
        storeResult.error,
      );
      return undefined;
    }

    const snapshotDir = storeResult.snapshotDir;

    // --- 세션 준비 (DB session_id 확보) ---
    const sessionId = await this.ensureSession(options.sessionId, type, createdAt);

    // --- DB 메타데이터 저장 ---
    let snapshotRow;
    try {
      snapshotRow = await this.snapshotRepository.create({
        snapshot_id: snapshotId,
        session_id: sessionId,
        type,
        reason: options.reason ?? null,
        summary: options.summary ?? null,
        local_path: path.relative(this.workspaceRoot, snapshotDir).replace(/\\/g, '/'),
        created_at: createdAt,
      });
    } catch (dbError) {
      console.error(
        `[SnapshotService] DB 저장 실패 (snapshotId=${snapshotId}):`,
        dbError,
      );
      await this.rollbackLocalFile(snapshotId);
      return undefined;
    }

    // --- snapshot_files DB 저장 ---
    await this.saveSnapshotFiles(snapshotId, changedFiles, createdAt);

    // --- Safety warning 로그 ---
    if (warnings.length > 0) {
      console.warn(
        `[SnapshotService] Safety 경고 ${warnings.length}개 포함 (snapshotId=${snapshotId}):`,
        warnings.map((w) => w.type).join(', '),
      );
    }

    console.log(
      `[SnapshotService] 스냅샷 생성 완료: id=${snapshotId}, type=${type}` +
      `, changedFiles=${changedFiles.length}` +
      `${userPatchText !== undefined ? ', userPatch=yes' : ''}` +
      `${isAiResult ? ', aiPatch=yes' : ''}`,
    );

    // --- 자동 삭제 정책 적용 (비동기, 실패 허용) ---
    this.scheduleCleanup();

    // --- AI 요약 제목 생성 (비동기, 실패 허용) ---
    this.scheduleAiSummary(snapshotRow.snapshot_id, type, patchText);

    return snapshotRow.snapshot_id;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * diff를 계산한다. baselines/changedFiles가 없으면 빈 diff를 반환한다.
   *
   * @param baselines 변경 전 파일 상태 맵
   * @param changedFilePaths 변경된 파일 경로 목록
   */
  private async buildDiff(
    baselines: Map<string, string> | undefined,
    changedFilePaths: string[] | undefined,
  ) {
    const resolvedBaselines = baselines ?? new Map<string, string>();
    const resolvedChanged = changedFilePaths ?? [];

    if (resolvedBaselines.size === 0 && resolvedChanged.length === 0) {
      return {
        patchText: '',
        hunks: [],
        changedFiles: [] as SnapshotFile[],
        warnings: [],
        skippedFiles: [],
        deletedFiles: [],
        riskyFiles: [],
      };
    }

    return this.diffService.buildFromWorkspace({
      workspaceRoot: this.workspaceRoot,
      baselines: resolvedBaselines,
      changedFiles: resolvedChanged,
    });
  }

  /**
   * DB에 session_id를 확보한다.
   *
   * 우선순위:
   * 1. options.sessionId가 넘어왔고 DB에 이미 있으면 그대로 사용
   * 2. 없으면 fallback 세션 row를 DB에 생성
   *
   * @param requestedSessionId caller가 전달한 sessionId (optional)
   * @param type 스냅샷 유형 (세션 type 결정에 사용)
   * @param createdAt 세션 생성 시각
   */
  private async ensureSession(
    requestedSessionId: string | undefined,
    type: SnapshotCreationType,
    createdAt: string,
  ): Promise<string> {
    // 전달된 sessionId가 DB에 이미 존재하는지 확인
    if (requestedSessionId) {
      try {
        const existing = await this.workSessionRepository.findById(requestedSessionId);
        if (existing) {
          return existing.session_id;
        }
      } catch {
        // 조회 실패 시 fallback 생성으로 이동
      }
    }

    // Fallback 세션 생성
    // AI 관련 타입이면 'ai', 그 외는 'manual' 세션 타입 사용
    const sessionType: 'ai' | 'manual' = type.startsWith('ai') ? 'ai' : 'manual';
    const fallbackSessionId =
      requestedSessionId ?? SnapshotIdGenerator.generateSessionId(sessionType);

    try {
      const session = await this.workSessionRepository.create({
        session_id: fallbackSessionId,
        worktree_instance_id: this.worktreeInstanceId,
        session_type: sessionType,
        status: 'completed',
        started_at: createdAt,
      });
      return session.session_id;
    } catch (error) {
      // 이미 같은 ID의 세션이 있는 경우 (race condition 등) 그냥 해당 ID 사용
      console.warn('[SnapshotService] Fallback 세션 생성 실패, 요청된 ID 직접 사용:', error);
      return fallbackSessionId;
    }
  }

  /**
   * 변경 파일 메타데이터를 snapshot_files 테이블에 저장한다.
   *
   * @param snapshotId 부모 스냅샷 ID
   * @param changedFiles diff 결과의 변경 파일 목록
   * @param createdAt 파일 생성 시각
   */
  private async saveSnapshotFiles(
    snapshotId: string,
    changedFiles: SnapshotFile[],
    createdAt: string,
  ): Promise<void> {
    if (changedFiles.length === 0) {
      return;
    }

    try {
      const fileInputs = changedFiles.map((file) => {
        // stored_path: 파일 경로를 슬래시 구분자로 정규화
        const normalizedPath = file.filePath.replace(/\\/g, '/');
        // file_name: 경로의 마지막 컴포넌트
        const fileName = normalizedPath.split('/').at(-1) ?? normalizedPath;

        return {
          snapshot_file_id: `${snapshotId}_${normalizedPath.replace(/[^A-Za-z0-9]/g, '_')}`,
          snapshot_id: snapshotId,
          // original_path: workspace 기준 상대 경로
          original_path: normalizedPath,
          // stored_path: 현재는 파일 원본 복사 없이 manifest 참조만 함 (diff 기반)
          stored_path: normalizedPath,
          file_name: fileName,
          content_hash: file.afterHash ?? file.beforeHash ?? null,
          created_at: createdAt,
        };
      });

      await this.snapshotFileRepository.createMany(fileInputs);
    } catch (error) {
      // snapshot_files 저장 실패는 경고만 남기고 스냅샷 생성은 유지
      console.error(
        `[SnapshotService] snapshot_files 저장 실패 (snapshotId=${snapshotId}):`,
        error,
      );
    }
  }

  /**
   * 로컬 파일 롤백: DB 저장 실패 시 이미 저장된 로컬 파일을 삭제한다.
   *
   * @param snapshotId 롤백할 스냅샷 ID
   */
  private async rollbackLocalFile(snapshotId: string): Promise<void> {
    try {
      await this.localStore.deleteSnapshot(snapshotId);
      console.log(`[SnapshotService] 로컬 파일 롤백 성공: ${snapshotId}`);
    } catch (rollbackError) {
      // 롤백 실패 시 orphan 파일이 남을 수 있음 - 경고만 남김
      console.error(
        `[SnapshotService] 로컬 파일 롤백 실패 (snapshotId=${snapshotId}) - orphan 파일 주의:`,
        rollbackError,
      );
    }
  }

  /**
   * 자동 삭제를 비동기적으로 스케줄링한다.
   * 스냅샷 생성 직후 호출하며, 실패해도 생성 결과에 영향 없음.
   */
  private scheduleCleanup(): void {
    setImmediate(async () => {
      try {
        await this.cleanupService.cleanup(this.worktreeInstanceId, {
          keepRecent: this.keepRecentCount,
          keepRecentPreRestore: this.keepRecentPreRestoreCount,
        });
      } catch (cleanupError) {
        console.error('[SnapshotService] 자동 삭제 중 오류 발생:', cleanupError);
      }
    });
  }

  /**
   * AI를 이용해 스냅샷 요약 제목을 비동기 생성하고 DB에 업데이트한다.
   * - aiClient가 없으면 조용히 건너뜀 (하위 호환)
   * - [AI] / [Human] 접두사를 type에 따라 자동으로 붙임
   * - 실패해도 스냅샷 생성 결과에 영향 없음
   */
  private scheduleAiSummary(
    snapshotId: string,
    type: SnapshotCreationType,
    patchText: string,
  ): void {
    if (!this.aiClient || !patchText) {
      return;
    }

    // 클로저 내부에서 undefined 가능성을 없애기 위해 로컬 변수에 고정
    const aiClient = this.aiClient;

    setImmediate(async () => {
      try {
        // [Task 45] 스냅샷 타입에 따른 세분화된 태그 결정
        let tag = '[User]';
        if (type === 'ai_result') {
          tag = '[AI]';
        } else if (type === 'ai_pre_action') {
          tag = '[AI Base]';
        } else if (type === 'savepoint') {
          tag = '[Save]';
        } else if (type === 'auto_dirty_before_ai') {
          tag = '[Pre-AI]';
        }

        // diff가 너무 길면 앞부분만 잘라서 전달 (토큰 절약)
        const trimmedDiff = patchText.length > 4000 ? patchText.slice(0, 4000) + '\n...(truncated)' : patchText;

        const rawSummary = await aiClient.generateResponse('recommendation', {
          systemPrompt: getSnapshotSummarySystemPrompt(),
          userPrompt: buildSnapshotSummaryUserPrompt(trimmedDiff),
        });

        // AI 응답에서 앞뒤 공백/줄바꿈 제거 후 태그 붙이기
        const summary = `${tag} ${rawSummary.trim().split('\n')[0]}`;

        await this.snapshotRepository.updateSummary(snapshotId, summary);
        console.log(`[SnapshotService] AI 요약 저장 완료: id=${snapshotId}, summary=${summary}`);

        // UI 업데이트 콜백 호출
        if (this.onSnapshotUpdated) {
          const updatedRow = await this.snapshotRepository.findById(snapshotId);
          if (updatedRow) {
            this.onSnapshotUpdated(updatedRow);
          }
        }
      } catch (aiError) {
        console.warn(`[SnapshotService] AI 요약 생성 실패 (snapshotId=${snapshotId}):`, aiError);
      }
    });
  }

  /**
   * diff patchText에서 실제 변경된 줄 수를 센다.
   * 유니파이드 diff 형식에서 +/- 로 시작하는 줄을 세되,
   * +++/--- 헤더 줄은 제외한다.
   */
  private countChangedLines(patchText: string): number {
    if (!patchText) {
      return 0;
    }
    return patchText
      .split('\n')
      .filter(
        (line) =>
          (line.startsWith('+') && !line.startsWith('+++')) ||
          (line.startsWith('-') && !line.startsWith('---')),
      ).length;
  }
}
