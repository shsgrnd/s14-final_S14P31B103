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
} from '@gitcat/ai-pipeline/extension';
import type { AiClient } from '@gitcat/ai-pipeline/extension';
import { ISnapshotService, SnapshotCreationType, CreateSnapshotOptions } from './ISnapshotService';
import { SnapshotDiffService, SnapshotFileInput } from './SnapshotDiffService';
import { SnapshotFullStateEntry, SnapshotLocalStore } from './SnapshotLocalStore';
import { SnapshotIdGenerator } from './SnapshotIdGenerator';
import { SnapshotAutoCleanupService } from './SnapshotAutoCleanupService';
import { SafetyCheckService } from './SafetyCheckService';
import { serializeSafetyWarnings } from './SafetyWarningSerialization';

/**
 * ?ㅻ깄???먮룞 ??젣 ?뺤콉: 理쒓렐 N媛?珥덇낵 ???ㅻ옒???ㅻ깄?룹쓣 ??젣?쒕떎.
 * ??媛믪쓣 ?섏젙?섎㈃ 蹂닿? 媛쒖닔 ?뺤콉??利됱떆 諛섏쁺?쒕떎.
 */
export const SNAPSHOT_KEEP_RECENT_COUNT = 10;
/**
 * pre_restore ?ㅻ깄??蹂꾨룄 蹂닿? 媛쒖닔.
 * 湲곕낯 ?뺤콉???쇰컲 ?ㅻ깄??蹂닿? ?섏? 蹂꾨룄濡??좎??쒕떎.
 */
export const SNAPSHOT_KEEP_RECENT_PRE_RESTORE_COUNT = 3;

/**
 * ?ㅻ깄???앹꽦 理쒖냼 蹂寃?以??? *
 * diff 寃곌낵??異붽?(+)/??젣(-) 以??⑷퀎媛 ??媛?誘몃쭔?대㈃ ?ㅻ깄?룹쓣 ?앹꽦?섏? ?딅뒗??
 * ?⑥닚 而ㅼ꽌 ?대룞 ???섎룄 ?녿뒗 蹂寃쎌쓣 ?꾪꽣留곹븯湲??꾪븳 媛믪씠??
 */
export const SNAPSHOT_MIN_CHANGED_LINES = 5;
const LOCAL_AI_SUMMARY_DELAY_MS = 300;

/**
 * SnapshotService ?앹꽦 ?듭뀡
 */
export interface SnapshotServiceOptions {
  /**
   * ????뚰겕?ㅽ럹?댁뒪 猷⑦듃 寃쎈줈
   * - diff 怨꾩궛 湲곗? ?붾젆?곕━
   * - 濡쒖뺄 ?뚯씪 ???湲곗? 寃쎈줈 (.vscode/gitcat/snapshots)
   */
  workspaceRoot: string;

  /**
   * ???뚰겕?ㅽ럹?댁뒪????묓븯??worktreeInstanceId
   * - ?놁쑝硫?workspaceRoot ?댁떆 湲곕컲 fallback ID瑜??ъ슜
   */
  worktreeInstanceId?: string;

  /**
   * ?먮룞 ??젣 ?뺤콉: 理쒓렐 N媛??좎? (湲곕낯媛?SNAPSHOT_KEEP_RECENT_COUNT)
   * 媛쒖닔瑜?諛붽씀?ㅻ㈃ SNAPSHOT_KEEP_RECENT_COUNT ?곸닔瑜??섏젙?섍굅????媛믪쓣 吏곸젒 ?꾨떖?쒕떎.
   */
  keepRecentCount?: number;

  /**
   * AI ?붿빟 湲곕뒫???꾪븳 AiClient ?몄뒪?댁뒪.
   * ?쒓났?섏? ?딆쑝硫??ㅻ깄???대쫫 ?먮룞 ?앹꽦??鍮꾪솢?깊솕?쒕떎.
   */
  aiClient?: AiClient;

  /**
   * ?ㅻ깄?룹씠 ?앹꽦??吏곹썑 UI??利됱떆 ?뚮━湲??꾪븳 釉뚮줈?쒖틦?ㅽ듃 肄쒕갚.
   * AI ?붿빟 ?꾩뿉 ?몄텧?섏뼱 '?앹꽦 以?..' ?먮뒗 鍮??쒕ぉ ?곹깭濡?紐⑸줉??癒쇱? 異붽??섎룄濡??⑸땲??
   */
  onSnapshotCreated?: (row: SnapshotRow) => void;

  /**
   * AI ?붿빟 ?꾨즺 ??UI???뚮━湲??꾪븳 釉뚮줈?쒖틦?ㅽ듃 肄쒕갚.
   * aiClient? ?④퍡 ?쒓났?댁빞 SNAPSHOT_UPDATED ?대깽?멸? ?꾩넚?쒕떎.
   */
  onSnapshotUpdated?: (row: SnapshotRow) => void;

  keepRecentPreRestoreCount?: number;
}

/**
 * GitCat Safety Layer???듭떖 Snapshot ?앹꽦 ?쒕퉬?? *
 * ??븷:
 * 1. SnapshotType蹂??앹꽦 ?먮쫫 ?쒓났 (F-25, F-26)
 * 2. SnapshotDiffService瑜??듯븳 AI diff / user diff 遺꾨━ 怨꾩궛
 * 3. SnapshotLocalStore瑜??듯븳 濡쒖뺄 ?뚯씪 ??? *    - patch.diff    : 二?蹂寃?diff
 *    - ai_patch.diff : AI 蹂寃쎈텇留? *    - user_patch.diff: ?ъ슜??蹂寃쎈텇留? * 4. SnapshotRepository瑜??듯븳 DB 硫뷀??곗씠????? * 5. ?ㅽ뙣 ??Local ??DB 遺덉씪移?諛⑹? (rollback ?쒕룄)
 * 6. ?앹꽦 ???먮룞 ??젣 ?뺤콉 ?곸슜 (理쒓렐 N媛??좎?)
 * 7. [Task 45] ?ㅻ깄???앹꽦 吏곹썑 諛깃렇?쇱슫?쒖뿉??AI ?붿빟 ?쒕ぉ ?먮룞 ?앹꽦
 *    - aiClient媛 二쇱엯??寃쎌슦?먮쭔 ?숈옉?섎ŉ, ?ㅽ뙣?대룄 ?ㅻ깄???앹꽦 寃곌낵???곹뼢 ?놁쓬
 *    - AI媛 諛섑솚????以??붿빟留??ㅻ깄???쒕ぉ?쇰줈 ??? */
export class SnapshotService implements ISnapshotService {
  private readonly localStore: SnapshotLocalStore;
  private readonly diffService: SnapshotDiffService;
  private readonly cleanupService: SnapshotAutoCleanupService;
  private readonly workspaceRoot: string;
  private readonly worktreeInstanceId: string;
  private readonly keepRecentCount: number;
  private readonly safetyCheckService: SafetyCheckService;
  /** AI ?붿빟 ?몄텧???ъ슜?섎뒗 AiClient ?몄뒪?댁뒪. ?쒓났?섏? ?딆쑝硫?AI ?붿빟 湲곕뒫??鍮꾪솢?깊솕??*/
  private readonly aiClient?: AiClient;
  /** ?ㅻ깄???앹꽦 吏곹썑 ?밸럭???대깽?몃? ?꾩넚?섍린 ?꾪븳 肄쒕갚 */
  private readonly onSnapshotCreated?: (row: SnapshotRow) => void;
  /** AI ?붿빟 ?꾨즺 ???밸럭??SNAPSHOT_UPDATED ?대깽?몃? ?꾩넚?섍린 ?꾪븳 肄쒕갚 */
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
    console.log(`[SnapshotService] ?ㅻ깄????젣 ?꾨즺: ${snapshotId}`);
  }

  async renameSnapshot(snapshotId: string, newTitle: string): Promise<void> {
    const existing = await this.snapshotRepository.findById(snapshotId);
    if (!existing) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }
    const trimmed = newTitle.trim();
    if (!trimmed) {
      throw new Error('Snapshot title cannot be empty');
    }
    await this.snapshotRepository.updateSummary(snapshotId, trimmed);
    console.log(`[SnapshotService] 스냅샷 표시 이름 변경 완료: ${snapshotId}`);
  }

  /**
   * 吏?뺥븳 ??낆쓽 Snapshot???앹꽦?쒕떎.
   *
   * @param type ?ㅻ깄???앹꽦 ?좏삎
   * @param options 蹂寃??뚯씪 紐⑸줉, 踰좎씠?ㅻ씪?? ?댁쑀, ?몄뀡 ID ??   * @returns ?앹꽦??snapshotId, ?ㅽ뙣 ??undefined
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

    console.log(`[SnapshotService] ?ㅻ깄???앹꽦 ?쒖옉: type=${type}, id=${snapshotId}`);

    // --- AI 蹂寃?diff 怨꾩궛 ---
    // baselines(AI ?몄뀡 ?쒖옉 ?쒖젏) ???꾩옱 ?뚯씪 ?곹깭 diff
    let diffResult;
    try {
      diffResult = await this.buildDiff(primaryBaselines, primaryChangedFiles, options.currentContents);
    } catch (diffError) {
      console.error('[SnapshotService] diff ?앹꽦 ?ㅽ뙣:', diffError);
      return undefined;
    }

    const { patchText, hunks, changedFiles, deletedFiles } = diffResult;
    const safetyWarnings = this.safetyCheckService.analyzeSnapshot({
      changedFiles,
      deletedFiles,
    });

    // --- ???議곌굔 泥댄겕 ---
    if (!options.force && type === 'savepoint') {
      // ?몄씠釉뚰룷?명듃: 蹂寃??뚯씪??0媛쒕㈃ ??ν븯吏 ?딆쓬 (以????쒗븳 ?놁쓬)
      if (changedFiles.length === 0) {
        console.log('[SnapshotService] 蹂寃쎈맂 ?뚯씪 ?놁쓬 ???몄씠釉뚰룷?명듃 ?앸왂');
        return undefined;
      }
    } else if (!options.force) {
      // ?먮룞 ?ㅻ깄?? 蹂寃?以??섍? 理쒖냼 湲곗? 誘몃쭔?대㈃ ?앸왂
      const totalChangedLines = this.countChangedLines(changedFiles);
      if (totalChangedLines < SNAPSHOT_MIN_CHANGED_LINES) {
        console.log(
          `[SnapshotService] 蹂寃?以???遺議????ㅻ깄???앸왂 ` +
          `(${totalChangedLines}以?< ${SNAPSHOT_MIN_CHANGED_LINES}以? type=${type})`,
        );
        return undefined;
      }
    }

    // --- ?ъ슜??蹂寃?diff 怨꾩궛 (?덈뒗 寃쎌슦) ---
    // userBaselines(吏곸쟾 AI ?몄뀡 醫낅즺 ?쒖젏) ???꾩옱 ?뚯씪 ?곹깭 diff
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
        // user diff ?ㅽ뙣??寃쎄퀬留??④린怨?怨꾩냽 吏꾪뻾
        console.warn('[SnapshotService] user diff ?앹꽦 ?ㅽ뙣 (臾댁떆):', userDiffError);
      }
    }

    // --- Manifest 援ъ꽦 ---
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

    // --- Local ?뚯씪 ???---
    // ai_result: ai_patch.diff (AI 蹂寃? + user_patch.diff (吏곸쟾 ?ъ슜??蹂寃?
    // auto_dirty_before_ai: user_patch.diff (?ъ슜??蹂寃? ?⑤룆
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
        `[SnapshotService] 濡쒖뺄 ?뚯씪 ????ㅽ뙣 (snapshotId=${snapshotId}):`,
        storeResult.error,
      );
      return undefined;
    }

    const snapshotDir = storeResult.snapshotDir;
    await this.saveFullSnapshotState(snapshotId, primaryBaselines, changedFiles, options.currentContents);

    // --- ?몄뀡 以鍮?(DB session_id ?뺣낫) ---
    const sessionId = await this.ensureSession(options.sessionId, type, createdAt);

    // --- DB 硫뷀??곗씠?????---
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
        `[SnapshotService] DB ????ㅽ뙣 (snapshotId=${snapshotId}):`,
        dbError,
      );
      await this.rollbackLocalFile(snapshotId);
      return undefined;
    }

    // --- snapshot_files DB ???---
    await this.saveSnapshotFiles(snapshotId, changedFiles, createdAt);

    // --- 利됱떆 UI ?낅뜲?댄듃 肄쒕갚 ?몄텧 ---
    if (this.onSnapshotCreated && snapshotRow) {
      try {
        this.onSnapshotCreated(snapshotRow);
      } catch (err) {
        console.error('[SnapshotService] onSnapshotCreated 肄쒕갚 以??ㅻ쪟:', err);
      }
    }

    // --- Safety warning 濡쒓렇 ---
    if (safetyWarnings.length > 0) {
      console.warn(
        `[SnapshotService] Safety 寃쎄퀬 ${safetyWarnings.length}媛??ы븿 (snapshotId=${snapshotId}):`,
        safetyWarnings.map((w) => w.code ?? w.type).join(', '),
      );
    }

    console.log(
      `[SnapshotService] ?ㅻ깄???앹꽦 ?꾨즺: id=${snapshotId}, type=${type}` +
      `, changedFiles=${changedFiles.length}` +
      `${userPatchText !== undefined ? ', userPatch=yes' : ''}` +
      `${isAiResult ? ', aiPatch=yes' : ''}`,
    );

    // --- ?먮룞 ??젣 ?뺤콉 ?곸슜 (鍮꾨룞湲? ?ㅽ뙣 ?덉슜) ---
    // pre_restore??restore ?먮쫫 ?쒓??대뜲?먯꽌 ?앹꽦?쒕떎. ????대컢??cleanup??媛숈씠 ?뚮㈃
    // Windows?먯꽌 ?붾젆?곕━ rename/delete 異⑸룎(EPERM)??諛쒖깮?????덉쑝誘濡?restore 以묒뿉??嫄대꼫?대떎.
    if (type !== 'pre_restore' && !this.isRestoreOperationActive()) {
      this.scheduleCleanup();
    }

    // --- AI ?붿빟 ?쒕ぉ ?앹꽦 (鍮꾨룞湲? ?ㅽ뙣 ?덉슜) ---
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

  // ?????????????????????????????????????????????????????????????????????????
  // Private Helpers
  // ?????????????????????????????????????????????????????????????????????????

  /**
   * diff瑜?怨꾩궛?쒕떎. baselines/changedFiles媛 ?놁쑝硫?鍮?diff瑜?諛섑솚?쒕떎.
   *
   * @param baselines 蹂寃????뚯씪 ?곹깭 留?   * @param changedFilePaths 蹂寃쎈맂 ?뚯씪 寃쎈줈 紐⑸줉
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
   * DB??session_id瑜??뺣낫?쒕떎.
   *
   * ?곗꽑?쒖쐞:
   * 1. options.sessionId媛 ?섏뼱?붽퀬 DB???대? ?덉쑝硫?洹몃?濡??ъ슜
   * 2. ?놁쑝硫?fallback ?몄뀡 row瑜?DB???앹꽦
   *
   * @param requestedSessionId caller媛 ?꾨떖??sessionId (optional)
   * @param type ?ㅻ깄???좏삎 (?몄뀡 type 寃곗젙???ъ슜)
   * @param createdAt ?몄뀡 ?앹꽦 ?쒓컖
   */
  private async ensureSession(
    requestedSessionId: string | undefined,
    type: SnapshotCreationType,
    createdAt: string,
  ): Promise<string> {
    // ?꾨떖??sessionId媛 DB???대? 議댁옱?섎뒗吏 ?뺤씤
    if (requestedSessionId) {
      try {
        const existing = await this.workSessionRepository.findById(requestedSessionId);
        if (existing) {
          return existing.session_id;
        }
      } catch {
        // 議고쉶 ?ㅽ뙣 ??fallback ?앹꽦?쇰줈 ?대룞
      }
    }

    // Fallback ?몄뀡 ?앹꽦
    // AI 愿????낆씠硫?'ai', 洹??몃뒗 'manual' ?몄뀡 ????ъ슜
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
      // ?대? 媛숈? ID???몄뀡???덈뒗 寃쎌슦 (race condition ?? 洹몃깷 ?대떦 ID ?ъ슜
      console.warn('[SnapshotService] Fallback ?몄뀡 ?앹꽦 ?ㅽ뙣, ?붿껌??ID 吏곸젒 ?ъ슜:', error);
      return fallbackSessionId;
    }
  }

  /**
   * 蹂寃??뚯씪 硫뷀??곗씠?곕? snapshot_files ?뚯씠釉붿뿉 ??ν븳??
   *
   * @param snapshotId 遺紐??ㅻ깄??ID
   * @param changedFiles diff 寃곌낵??蹂寃??뚯씪 紐⑸줉
   * @param createdAt ?뚯씪 ?앹꽦 ?쒓컖
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
        // stored_path: ?뚯씪 寃쎈줈瑜??щ옒??援щ텇?먮줈 ?뺢퇋??        const normalizedPath = file.filePath.replace(/\\/g, '/');
        // file_name: 寃쎈줈??留덉?留?而댄룷?뚰듃
        const fileName = normalizedPath.split('/').at(-1) ?? normalizedPath;

        return {
          snapshot_file_id: `${snapshotId}_${normalizedPath.replace(/[^A-Za-z0-9]/g, '_')}`,
          snapshot_id: snapshotId,
          // original_path: workspace 湲곗? ?곷? 寃쎈줈
          original_path: normalizedPath,
          // stored_path: ?꾩옱???뚯씪 ?먮낯 蹂듭궗 ?놁씠 manifest 李몄“留???(diff 湲곕컲)
          stored_path: normalizedPath,
          file_name: fileName,
          content_hash: file.afterHash ?? file.beforeHash ?? null,
          created_at: createdAt,
        };
      });

      await this.snapshotFileRepository.createMany(fileInputs);
    } catch (error) {
      // snapshot_files ????ㅽ뙣??寃쎄퀬留??④린怨??ㅻ깄???앹꽦? ?좎?
      console.error(
        `[SnapshotService] snapshot_files ????ㅽ뙣 (snapshotId=${snapshotId}):`,
        error,
      );
    }
  }

  /**
   * 濡쒖뺄 ?뚯씪 濡ㅻ갚: DB ????ㅽ뙣 ???대? ??λ맂 濡쒖뺄 ?뚯씪????젣?쒕떎.
   *
   * @param snapshotId 濡ㅻ갚???ㅻ깄??ID
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
      console.log(`[SnapshotService] 濡쒖뺄 ?뚯씪 濡ㅻ갚 ?깃났: ${snapshotId}`);
    } catch (rollbackError) {
      // 濡ㅻ갚 ?ㅽ뙣 ??orphan ?뚯씪???⑥쓣 ???덉쓬 - 寃쎄퀬留??④?
      console.error(
        `[SnapshotService] 濡쒖뺄 ?뚯씪 濡ㅻ갚 ?ㅽ뙣 (snapshotId=${snapshotId}) - orphan ?뚯씪 二쇱쓽:`,
        rollbackError,
      );
    }
  }

  /**
   * ?먮룞 ??젣瑜?鍮꾨룞湲곗쟻?쇰줈 ?ㅼ?以꾨쭅?쒕떎.
   * ?ㅻ깄???앹꽦 吏곹썑 ?몄텧?섎ŉ, ?ㅽ뙣?대룄 ?앹꽦 寃곌낵???곹뼢 ?놁쓬.
   */
  private scheduleCleanup(): void {
    setImmediate(async () => {
      try {
        await this.cleanupService.cleanup(this.worktreeInstanceId, {
          keepRecent: this.keepRecentCount,
          keepRecentPreRestore: this.keepRecentPreRestoreCount,
        });
      } catch (cleanupError) {
        console.error('[SnapshotService] ?먮룞 ??젣 以??ㅻ쪟 諛쒖깮:', cleanupError);
      }
    });
  }

  /**
   * AI瑜??댁슜???ㅻ깄???붿빟 ?쒕ぉ??鍮꾨룞湲??앹꽦?섍퀬 DB???낅뜲?댄듃?쒕떎.
   * - aiClient媛 ?놁쑝硫?議곗슜??嫄대꼫? (?섏쐞 ?명솚)
   * - AI媛 ?앹꽦????以??붿빟留???ν븯怨?蹂꾨룄 ?묐몢?щ뒗 遺숈씠吏 ?딆쓬
   * - ?ㅽ뙣?대룄 ?ㅻ깄???앹꽦 寃곌낵???곹뼢 ?놁쓬
   */
  private scheduleAiSummary(
    snapshotId: string,
    patchText: string,
  ): void {
    if (!this.aiClient || !patchText) {
      return;
    }

    // ?대줈? ?대??먯꽌 undefined 媛?μ꽦???놁븷湲??꾪빐 濡쒖뺄 蹂?섏뿉 怨좎젙
    const aiClient = this.aiClient;

    const runSummary = async () => {
      try {
        // diff媛 ?덈Т 湲몃㈃ ?욌?遺꾨쭔 ?섎씪???꾨떖 (?좏겙 ?덉빟)
        const trimmedDiff = patchText.length > 4000 ? patchText.slice(0, 4000) + '\n...(truncated)' : patchText;

        const rawSummary = await aiClient.generateResponse('recommendation', {
          systemPrompt: getSnapshotSummarySystemPrompt(),
          userPrompt: buildSnapshotSummaryUserPrompt(trimmedDiff),
        }, {
          priority: 'background',
        });

        // ?ㅻ깄??紐⑸줉?먮뒗 遺꾨쪟 ?쒓렇蹂대떎 ?ㅼ젣 ?묒뾽 ?붿빟????以묒슂?댁꽌 ?쒕ぉ 蹂몃Ц留???ν빀?덈떎.
        const summary = rawSummary.trim().split('\n')[0];

        await this.snapshotRepository.updateSummary(snapshotId, summary);
        console.log(`[SnapshotService] AI ?붿빟 ????꾨즺: id=${snapshotId}, summary=${summary}`);

        // UI ?낅뜲?댄듃 肄쒕갚 ?몄텧
        if (this.onSnapshotUpdated) {
          const updatedRow = await this.snapshotRepository.findById(snapshotId);
          if (updatedRow) {
            this.onSnapshotUpdated(updatedRow);
          }
        }
      } catch (aiError) {
        console.warn(`[SnapshotService] AI ?붿빟 ?앹꽦 ?ㅽ뙣 (snapshotId=${snapshotId}):`, aiError);
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
   * diff patchText?먯꽌 ?ㅼ젣 蹂寃쎈맂 以??섎? ?쇰떎.
   * ?좊땲?뚯씠??diff ?뺤떇?먯꽌 +/- 濡??쒖옉?섎뒗 以꾩쓣 ?몃릺,
   * +++/--- ?ㅻ뜑 以꾩? ?쒖쇅?쒕떎.
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



