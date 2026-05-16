import * as fs from 'fs/promises';
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
import { SnapshotDiffService, SnapshotFileInput } from './SnapshotDiffService';
import { SnapshotFullStateEntry, SnapshotLocalStore } from './SnapshotLocalStore';
import { SnapshotIdGenerator } from './SnapshotIdGenerator';
import { SnapshotAutoCleanupService } from './SnapshotAutoCleanupService';
import { SafetyCheckService } from './SafetyCheckService';
import { serializeSafetyWarnings } from './SafetyWarningSerialization';

/**
 * 스냅샷 자동 삭제 정책: 최근 N개 초과 시 오래된 스냅샷을 삭제한다.
 * 이 값을 수정하면 보관 개수 정책이 즉시 반영된다.
 */
export const SNAPSHOT_KEEP_RECENT_COUNT = 10;
/**
 * pre_restore 스냅샷 별도 보관 개수.
 * 기본 정책상 일반 스냅샷 보관 수와 별도로 유지된다.
 */
export const SNAPSHOT_KEEP_RECENT_PRE_RESTORE_COUNT = 3;

/**
 * 스냅샷 생성 최소 변경 줄 수
 *
 * diff 결과의 추가(+)/삭제(-) 줄 합계가 이 값 미만이면 스냅샷을 생성하지 않는다.
 * 단순 커서 이동 등 의도 없는 변경을 필터링하기 위한 값이다.
 */
export const SNAPSHOT_MIN_CHANGED_LINES = 5;
const LOCAL_AI_SUMMARY_DELAY_MS = 300;

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
   * 스냅샷이 생성된 직후 UI에 즉시 알리기 위한 브로드캐스트 콜백.
   * AI 요약 전에 호출되어 '생성 중...' 또는 빈 제목 상태로 목록에 먼저 추가되도록 합니다.
   */
  onSnapshotCreated?: (row: SnapshotRow) => void;

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
 *    - AI가 반환한 한 줄 요약만 스냅샷 제목으로 저장
 */
export class SnapshotService implements ISnapshotService {
  private readonly localStore: SnapshotLocalStore;
  private readonly diffService: SnapshotDiffService;
  private readonly cleanupService: SnapshotAutoCleanupService;
  private readonly workspaceRoot: string;
  private readonly worktreeInstanceId: string;
  private readonly keepRecentCount: number;
  private readonly safetyCheckService: SafetyCheckService;
  /** AI 요약 호출에 사용되는 AiClient 인스턴스. 제공되지 않으면 AI 요약 기능이 비활성화됨 */
  private readonly aiClient?: AiClient;
  /** 스냅샷 생성 직후 웹뷰에 이벤트를 전송하기 위한 콜백 */
  private readonly onSnapshotCreated?: (row: SnapshotRow) => void;
  /** AI 요약 완료 후 웹뷰에 SNAPSHOT_UPDATED 이벤트를 전송하기 위한 콜백 */
  private readonly onSnapshotUpdated?: (row: SnapshotRow) => void;
  private readonly keepRecentPreRestoreCount: number;
  private restoreOperationDepth = 0;

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
    this.safetyCheckService = new SafetyCheckService(this.workspaceRoot);
    this.aiClient = options.aiClient;
    this.onSnapshotCreated = options.onSnapshotCreated;
    this.onSnapshotUpdated = options.onSnapshotUpdated;
    this.keepRecentPreRestoreCount =
      options.keepRecentPreRestoreCount ??
      SNAPSHOT_KEEP_RECENT_PRE_RESTORE_COUNT;

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
    if (this.restoreOperationDepth > 0 && type !== 'pre_restore') {
      console.log(`[SnapshotService] restore lock active, skipped snapshot type=${type}`);
      return undefined;
    }

    const snapshotId = SnapshotIdGenerator.generate(type);
    const createdAt = new Date().toISOString();
    const primaryBaselines = options.baselines ?? options.userBaselines;
    const primaryChangedFiles = options.changedFiles ?? options.userChangedFiles;

    console.log(`[SnapshotService] 스냅샷 생성 시작: type=${type}, id=${snapshotId}`);

    // --- AI 변경 diff 계산 ---
    // baselines(AI 세션 시작 시점) → 현재 파일 상태 diff
    let diffResult;
    try {
      diffResult = await this.buildDiff(primaryBaselines, primaryChangedFiles, options.currentContents);
    } catch (diffError) {
      console.error('[SnapshotService] diff 생성 실패:', diffError);
      return undefined;
    }

    const { patchText, hunks, changedFiles, deletedFiles } = diffResult;
    const safetyWarnings = this.safetyCheckService.analyzeSnapshot({
      changedFiles,
      deletedFiles,
    });

    // --- 저장 조건 체크 ---
    if (!options.force && type === 'savepoint') {
      // 세이브포인트: 변경 파일이 0개면 저장하지 않음 (줄 수 제한 없음)
      if (changedFiles.length === 0) {
        console.log('[SnapshotService] 변경된 파일 없음 → 세이브포인트 생략');
        return undefined;
      }
    } else if (!options.force) {
      // 자동 스냅샷: 변경 줄 수가 최소 기준 미만이면 생략
      const totalChangedLines = this.countChangedLines(changedFiles);
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
        const userDiff = await this.buildDiff(
          options.userBaselines,
          options.userChangedFiles ?? [],
          options.userCurrentContents,
        );
        userPatchText = userDiff.patchText;
      } catch (userDiffError) {
        // user diff 실패는 경고만 남기고 계속 진행
        console.warn('[SnapshotService] user diff 생성 실패 (무시):', userDiffError);
      }
    }

    // --- Manifest 구성 ---
    const previousSnapshot = await this.snapshotRepository.findLatestByWorktreeInstance(this.worktreeInstanceId);
    const previousSnapshotId = previousSnapshot?.snapshot_id ?? undefined;

    const manifest: SnapshotManifest = {
      snapshotId,
      type,
      previousSnapshotId,
      createdAt,
      reason: options.reason,
      summary: options.summary,
      changedFiles,
      safetyWarnings: safetyWarnings.length > 0 ? safetyWarnings : undefined,
      warnings: safetyWarnings.length > 0 ? safetyWarnings : undefined,
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
      includeFullFileBackupDir: true,
    });

    if (!storeResult.ok) {
      console.error(
        `[SnapshotService] 로컬 파일 저장 실패 (snapshotId=${snapshotId}):`,
        storeResult.error,
      );
      return undefined;
    }

    const snapshotDir = storeResult.snapshotDir;
    await this.saveFullSnapshotState(snapshotId, primaryBaselines, changedFiles, options.currentContents);

    // --- 세션 준비 (DB session_id 확보) ---
    const sessionId = await this.ensureSession(options.sessionId, type, createdAt);

    // --- DB 메타데이터 저장 ---
    let snapshotRow;
    try {
      snapshotRow = await this.snapshotRepository.create({
        snapshot_id: snapshotId,
        session_id: sessionId,
        type,
        previous_snapshot_id: previousSnapshotId ?? null,
        reason: options.reason ?? null,
        summary: options.summary ?? null,
        local_path: path.relative(this.workspaceRoot, snapshotDir).replace(/\\/g, '/'),
        safety_warnings_json: serializeSafetyWarnings(safetyWarnings),
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

    // --- 즉시 UI 업데이트 콜백 호출 ---
    if (this.onSnapshotCreated && snapshotRow) {
      try {
        this.onSnapshotCreated(snapshotRow);
      } catch (err) {
        console.error('[SnapshotService] onSnapshotCreated 콜백 중 오류:', err);
      }
    }

    // --- Safety warning 로그 ---
    if (safetyWarnings.length > 0) {
      console.warn(
        `[SnapshotService] Safety 경고 ${safetyWarnings.length}개 포함 (snapshotId=${snapshotId}):`,
        safetyWarnings.map((w) => w.code ?? w.type).join(', '),
      );
    }

    console.log(
      `[SnapshotService] 스냅샷 생성 완료: id=${snapshotId}, type=${type}` +
      `, changedFiles=${changedFiles.length}` +
      `${userPatchText !== undefined ? ', userPatch=yes' : ''}` +
      `${isAiResult ? ', aiPatch=yes' : ''}`,
    );

    // --- 자동 삭제 정책 적용 (비동기, 실패 허용) ---
    // pre_restore는 restore 흐름 한가운데에서 생성된다. 이 타이밍에 cleanup이 같이 돌면
    // Windows에서 디렉터리 rename/delete 충돌(EPERM)이 발생할 수 있으므로 restore 중에는 건너뛴다.
    if (type !== 'pre_restore' && !this.isRestoreOperationActive()) {
      this.scheduleCleanup();
    }

    // --- AI 요약 제목 생성 (비동기, 실패 허용) ---
    this.scheduleAiSummary(snapshotRow.snapshot_id, patchText);

    return snapshotRow.snapshot_id;
  }

  beginRestoreOperation(): void {
    this.restoreOperationDepth += 1;
  }

  endRestoreOperation(): void {
    this.restoreOperationDepth = Math.max(0, this.restoreOperationDepth - 1);
  }

  isRestoreOperationActive(): boolean {
    return this.restoreOperationDepth > 0;
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
    baselines: Map<string, Uint8Array> | undefined,
    changedFilePaths: string[] | undefined,
    currentContents: Map<string, Uint8Array | null> | undefined,
  ) {
    const resolvedBaselines = baselines ?? new Map<string, Uint8Array>();
    const resolvedChanged = changedFilePaths ?? [];

    if (resolvedBaselines.size === 0 && resolvedChanged.length === 0) {
      return {
        patchText: '',
        hunks: [],
        changedFiles: [] as SnapshotFile[],
        skippedFiles: [],
        deletedFiles: [],
        riskyFiles: [],
      };
    }

    const baselineFiles: SnapshotFileInput[] = [];
    for (const [filePath, content] of resolvedBaselines.entries()) {
      baselineFiles.push({ filePath, content });
    }

    const currentFiles: SnapshotFileInput[] = [];
    for (const filePath of resolvedChanged) {
      const normalizedPath = this.normalizeWorkspacePath(filePath);
      if (currentContents?.has(filePath)) {
        const content = currentContents.get(filePath) ?? null;
        currentFiles.push({ filePath: normalizedPath, content });
        continue;
      }
      if (currentContents?.has(normalizedPath)) {
        const content = currentContents.get(normalizedPath) ?? null;
        currentFiles.push({ filePath: normalizedPath, content });
        continue;
      }

      const diskContent = await this.readWorkspaceFileContent(normalizedPath);
      currentFiles.push({ filePath: normalizedPath, content: diskContent });
    }

    return this.diffService.buildSnapshotDiff({
      baselineFiles,
      currentFiles,
      options: {
        workspaceRoot: this.workspaceRoot,
      },
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
  private async saveFullSnapshotState(
    snapshotId: string,
    baselines: Map<string, Uint8Array> | undefined,
    changedFiles: SnapshotFile[],
    currentContents: Map<string, Uint8Array | null> | undefined,
  ): Promise<void> {
    if (changedFiles.length === 0) {
      return;
    }

    const beforeEntries: SnapshotFullStateEntry[] = [];
    const afterEntries: SnapshotFullStateEntry[] = [];
    const normalizedBaselines = new Map<string, Uint8Array>();
    for (const [filePath, content] of baselines ?? new Map<string, Uint8Array>()) {
      normalizedBaselines.set(this.normalizeWorkspacePath(filePath), content);
    }
    const normalizedCurrentContents = new Map<string, Uint8Array | null>();
    for (const [filePath, content] of currentContents ?? new Map<string, Uint8Array | null>()) {
      normalizedCurrentContents.set(this.normalizeWorkspacePath(filePath), content);
    }

    for (const file of changedFiles) {
      const targetPath = this.normalizeWorkspacePath(file.filePath);
      const currentContent = normalizedCurrentContents.has(targetPath)
        ? normalizedCurrentContents.get(targetPath) ?? null
        : await this.readWorkspaceFileContent(targetPath);

      if (file.status === 'renamed' && file.renamedFrom) {
        const beforePath = this.normalizeWorkspacePath(file.renamedFrom);
        beforeEntries.push({
          filePath: beforePath,
          content: normalizedBaselines.get(beforePath) ?? null,
        });
      } else {
        beforeEntries.push({
          filePath: targetPath,
          content: normalizedBaselines.get(targetPath) ?? null,
        });
      }

      afterEntries.push({
        filePath: targetPath,
        content: currentContent,
      });
    }

    await this.localStore.saveFullSnapshotState(snapshotId, {
      before: beforeEntries,
      after: afterEntries,
    });
  }

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
   * - AI가 생성한 한 줄 요약만 저장하고 별도 접두사는 붙이지 않음
   * - 실패해도 스냅샷 생성 결과에 영향 없음
   */
  private scheduleAiSummary(
    snapshotId: string,
    patchText: string,
  ): void {
    if (!this.aiClient || !patchText) {
      return;
    }

    // 클로저 내부에서 undefined 가능성을 없애기 위해 로컬 변수에 고정
    const aiClient = this.aiClient;

    const runSummary = async () => {
      try {
        // diff가 너무 길면 앞부분만 잘라서 전달 (토큰 절약)
        const trimmedDiff = patchText.length > 4000 ? patchText.slice(0, 4000) + '\n...(truncated)' : patchText;

        const rawSummary = await aiClient.generateResponse('recommendation', {
          systemPrompt: getSnapshotSummarySystemPrompt(),
          userPrompt: buildSnapshotSummaryUserPrompt(trimmedDiff),
        }, {
          priority: 'background',
        });

        // 스냅샷 목록에는 분류 태그보다 실제 작업 요약이 더 중요해서 제목 본문만 저장합니다.
        const summary = rawSummary.trim().split('\n')[0];

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
    };

    if (aiClient.isLiveLocalMode()) {
      setTimeout(() => {
        void runSummary();
      }, LOCAL_AI_SUMMARY_DELAY_MS);
      return;
    }

    setImmediate(() => {
      void runSummary();
    });
  }

  /**
   * diff patchText에서 실제 변경된 줄 수를 센다.
   * 유니파이드 diff 형식에서 +/- 로 시작하는 줄을 세되,
   * +++/--- 헤더 줄은 제외한다.
   */
  private countChangedLines(changedFiles: SnapshotFile[]): number {
    return changedFiles.reduce((sum, file) => {
      const additions = file.additions ?? 0;
      const deletions = file.deletions ?? 0;
      return sum + additions + deletions;
    }, 0);
  }

  private normalizeWorkspacePath(filePath: string): string {
    return this.localStore.toWorkspaceRelativePath(filePath);
  }

  private async readWorkspaceFileContent(filePath: string): Promise<Uint8Array | null> {
    const absolutePath = path.resolve(this.workspaceRoot, filePath);
    try {
      return await fs.readFile(absolutePath);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
}
