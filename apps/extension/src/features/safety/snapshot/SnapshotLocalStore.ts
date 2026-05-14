import * as fs from 'fs/promises';
import * as path from 'path';
import type { SnapshotHunk, SnapshotManifest } from '@gitcat/shared-types';

const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const SNAPSHOT_DIR = path.join('.vscode', 'gitcat', 'snapshots');
const EXCLUDED_PATH_SEGMENTS = new Set(['.git', 'node_modules', 'dist', 'build']);
/**
 * 스냅샷 디렉터리 내 저장 가능한 아티팩트 파일명 허용 목록
 * - patch.diff     : AI+사용자 통합 diff (주 diff)
 * - ai_patch.diff  : AI가 변경한 diff만 분리
 * - user_patch.diff: 사용자가 변경한 diff만 분리
 */
const ALLOWED_ARTIFACT_FILES = new Set([
  'manifest.json',
  'patch.diff',
  'hunks.json',
  'ai_patch.diff',
  'user_patch.diff',
]);
const TEMP_DIR_INFIX = '__tmp__';

export interface SnapshotLocalArtifact {
  manifest: SnapshotManifest;
  /** 통합 patch (AI + 사용자 합산, 또는 해당 타입의 주 변경) */
  patchText: string;
  hunks: SnapshotHunk[];
  /** AI가 변경한 diff. ai_result 타입에서 설정 */
  aiPatchText?: string;
  /** 사용자가 변경한 diff. auto_dirty_before_ai/ai_result 타입에서 설정 */
  userPatchText?: string;
  includeFullFileBackupDir?: boolean;
  includeCodeBlobStoreDir?: boolean;
}

export interface SnapshotStoreSuccess {
  ok: true;
  snapshotId: string;
  snapshotDir: string;
  manifestPath: string;
  patchPath: string;
  hunksPath: string;
}

export interface SnapshotStoreFailure {
  ok: false;
  snapshotId: string;
  snapshotDir: string;
  error: Error;
  cleanedUp: boolean;
}

export type SnapshotStoreResult = SnapshotStoreSuccess | SnapshotStoreFailure;

export interface SnapshotLocalArtifactReadResult {
  manifest: SnapshotManifest;
  patchText: string;
  hunks: SnapshotHunk[];
}

export interface SnapshotTrashHandle {
  snapshotId: string;
  originalDir: string;
  trashedDir: string;
}

/**
 * .vscode/gitcat/snapshots/{snapshotId} 하위의 스냅샷 산출물을 관리한다.
 *
 * 이 클래스는 DB repository나 스냅샷 생성 정책을 알지 않는다. 파일 저장/조회/삭제,
 * 경로 검증, partial 생성물 정리만 책임진다.
 */
export class SnapshotLocalStore {
  private readonly projectRoot: string;
  private readonly snapshotsRoot: string;

  constructor(projectRoot: string) {
    if (!projectRoot) {
      throw new Error('projectRoot is required for SnapshotLocalStore.');
    }

    this.projectRoot = path.resolve(projectRoot);
    this.snapshotsRoot = path.join(this.projectRoot, SNAPSHOT_DIR);
  }

  getSnapshotsRoot(): string {
    return this.snapshotsRoot;
  }

  getSnapshotDir(snapshotId: string): string {
    const safeSnapshotId = this.assertValidSnapshotId(snapshotId);
    const snapshotDir = path.resolve(this.snapshotsRoot, safeSnapshotId);
    this.assertInsideDirectory(this.snapshotsRoot, snapshotDir, 'snapshot directory');
    return snapshotDir;
  }

  async saveSnapshotArtifact(artifact: SnapshotLocalArtifact): Promise<SnapshotStoreResult> {
    const snapshotId = artifact.manifest.snapshotId;
    const snapshotDir = this.getSnapshotDir(snapshotId);
    const tempSnapshotDir = this.getTemporarySnapshotDir(snapshotId);

    try {
      this.validateManifestPaths(artifact.manifest);
      await this.assertSnapshotDoesNotExist(snapshotDir, snapshotId);
      await fs.mkdir(tempSnapshotDir, { recursive: true });

      if (artifact.includeFullFileBackupDir) {
        await fs.mkdir(path.join(tempSnapshotDir, 'full'), { recursive: true });
      }
      if (artifact.includeCodeBlobStoreDir) {
        await fs.mkdir(path.join(tempSnapshotDir, 'blobs'), { recursive: true });
      }

      const manifestPath = this.resolveArtifactPath(tempSnapshotDir, 'manifest.json');
      const patchPath = this.resolveArtifactPath(tempSnapshotDir, 'patch.diff');
      const hunksPath = this.resolveArtifactPath(tempSnapshotDir, 'hunks.json');

      await fs.writeFile(manifestPath, `${JSON.stringify(artifact.manifest, null, 2)}\n`, 'utf8');
      await fs.writeFile(patchPath, artifact.patchText, 'utf8');
      await fs.writeFile(hunksPath, `${JSON.stringify(artifact.hunks, null, 2)}\n`, 'utf8');

      // 선택적 diff 파일: 존재하는 경우에만 저장
      if (artifact.aiPatchText !== undefined) {
        const aiPatchPath = this.resolveArtifactPath(tempSnapshotDir, 'ai_patch.diff');
        await fs.writeFile(aiPatchPath, artifact.aiPatchText, 'utf8');
      }
      if (artifact.userPatchText !== undefined) {
        const userPatchPath = this.resolveArtifactPath(tempSnapshotDir, 'user_patch.diff');
        await fs.writeFile(userPatchPath, artifact.userPatchText, 'utf8');
      }

      await fs.rename(tempSnapshotDir, snapshotDir);

      return {
        ok: true,
        snapshotId,
        snapshotDir,
        manifestPath: this.resolveSnapshotFile(snapshotId, 'manifest.json'),
        patchPath: this.resolveSnapshotFile(snapshotId, 'patch.diff'),
        hunksPath: this.resolveSnapshotFile(snapshotId, 'hunks.json'),
      };
    } catch (error) {
      let cleanedUp = false;
      try {
        await fs.rm(tempSnapshotDir, { recursive: true, force: true });
        cleanedUp = true;
      } catch {
        cleanedUp = false;
      }

      return {
        ok: false,
        snapshotId,
        snapshotDir,
        error: error instanceof Error ? error : new Error(String(error)),
        cleanedUp,
      };
    }
  }

  async readManifest(snapshotId: string): Promise<SnapshotManifest> {
    const raw = await fs.readFile(this.resolveSnapshotFile(snapshotId, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(raw) as SnapshotManifest;
    this.assertMatchingSnapshotId(snapshotId, manifest.snapshotId);
    this.validateManifestPaths(manifest);
    return manifest;
  }

  async readPatch(snapshotId: string): Promise<string> {
    return fs.readFile(this.resolveSnapshotFile(snapshotId, 'patch.diff'), 'utf8');
  }

  async readHunks(snapshotId: string): Promise<SnapshotHunk[]> {
    const raw = await fs.readFile(this.resolveSnapshotFile(snapshotId, 'hunks.json'), 'utf8');
    return JSON.parse(raw) as SnapshotHunk[];
  }

  async readSnapshotArtifact(snapshotId: string): Promise<SnapshotLocalArtifactReadResult> {
    const [manifest, patchText, hunks] = await Promise.all([
      this.readManifest(snapshotId),
      this.readPatch(snapshotId),
      this.readHunks(snapshotId),
    ]);

    return { manifest, patchText, hunks };
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    await fs.rm(this.getSnapshotDir(snapshotId), { recursive: true, force: true });
  }

  async moveSnapshotToTrash(snapshotId: string): Promise<SnapshotTrashHandle | null> {
    const originalDir = this.getSnapshotDir(snapshotId);
    const trashedDir = this.getTemporaryTrashDir(snapshotId);

    try {
      await fs.access(originalDir);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === 'ENOENT') {
        return null;
      }
      throw error;
    }

    await fs.rename(originalDir, trashedDir);
    return {
      snapshotId,
      originalDir,
      trashedDir,
    };
  }

  async restoreSnapshotFromTrash(handle: SnapshotTrashHandle): Promise<void> {
    this.assertMatchingSnapshotId(handle.snapshotId, path.basename(handle.originalDir));
    this.assertInsideDirectory(this.snapshotsRoot, handle.originalDir, 'snapshot directory');
    this.assertInsideDirectory(this.snapshotsRoot, handle.trashedDir, 'trashed snapshot directory');
    await fs.rename(handle.trashedDir, handle.originalDir);
  }

  async deleteTrashedSnapshot(handle: SnapshotTrashHandle): Promise<void> {
    this.assertInsideDirectory(this.snapshotsRoot, handle.trashedDir, 'trashed snapshot directory');
    await fs.rm(handle.trashedDir, { recursive: true, force: true });
  }

  async ensureAuxiliaryDirs(snapshotId: string): Promise<{ fullDir: string; blobsDir: string }> {
    const snapshotDir = this.getSnapshotDir(snapshotId);
    const fullDir = path.join(snapshotDir, 'full');
    const blobsDir = path.join(snapshotDir, 'blobs');

    this.assertInsideDirectory(snapshotDir, fullDir, 'full directory');
    this.assertInsideDirectory(snapshotDir, blobsDir, 'blobs directory');

    await fs.mkdir(fullDir, { recursive: true });
    await fs.mkdir(blobsDir, { recursive: true });

    return { fullDir, blobsDir };
  }

  toWorkspaceRelativePath(filePath: string): string {
    if (!filePath) {
      throw new Error('filePath is required.');
    }

    const absolutePath = path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : path.resolve(this.projectRoot, filePath);

    this.assertInsideDirectory(this.projectRoot, absolutePath, `workspace file path: ${filePath}`);
    this.assertAllowedWorkspacePath(absolutePath, filePath);

    const relativePath = path.relative(this.projectRoot, absolutePath);
    if (!relativePath) {
      throw new Error(`Workspace root itself cannot be stored as a snapshot file path: ${filePath}`);
    }

    return relativePath.replace(/\\/g, '/');
  }

  private resolveSnapshotFile(snapshotId: string, fileName: string): string {
    const snapshotDir = this.getSnapshotDir(snapshotId);
    return this.resolveArtifactPath(snapshotDir, fileName);
  }

  private resolveArtifactPath(snapshotDir: string, fileName: string): string {
    if (!ALLOWED_ARTIFACT_FILES.has(fileName)) {
      throw new Error(`Unsupported snapshot artifact file: ${fileName}`);
    }

    const artifactPath = path.resolve(snapshotDir, fileName);
    this.assertInsideDirectory(snapshotDir, artifactPath, `${fileName} path`);
    return artifactPath;
  }

  private validateManifestPaths(manifest: SnapshotManifest): void {
    this.assertMatchingSnapshotId(manifest.snapshotId, manifest.snapshotId);

    for (const changedFile of manifest.changedFiles) {
      changedFile.filePath = this.toWorkspaceRelativePath(changedFile.filePath);
    }
  }

  private assertValidSnapshotId(snapshotId: string): string {
    if (
      !snapshotId ||
      snapshotId === '.' ||
      snapshotId === '..' ||
      snapshotId.includes('/') ||
      snapshotId.includes('\\') ||
      !SNAPSHOT_ID_PATTERN.test(snapshotId)
    ) {
      throw new Error(`Invalid snapshotId: ${snapshotId}`);
    }

    return snapshotId;
  }

  private getTemporarySnapshotDir(snapshotId: string): string {
    const tempDirName = `${this.assertValidSnapshotId(snapshotId)}${TEMP_DIR_INFIX}${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const tempDir = path.resolve(this.snapshotsRoot, tempDirName);
    this.assertInsideDirectory(this.snapshotsRoot, tempDir, 'temporary snapshot directory');
    return tempDir;
  }

  private getTemporaryTrashDir(snapshotId: string): string {
    const tempDirName = `${this.assertValidSnapshotId(snapshotId)}${TEMP_DIR_INFIX}trash_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const tempDir = path.resolve(this.snapshotsRoot, tempDirName);
    this.assertInsideDirectory(this.snapshotsRoot, tempDir, 'temporary trash directory');
    return tempDir;
  }

  private async assertSnapshotDoesNotExist(snapshotDir: string, snapshotId: string): Promise<void> {
    try {
      await fs.access(snapshotDir);
      throw new Error(`Snapshot already exists and will not be overwritten: ${snapshotId}`);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  private assertMatchingSnapshotId(expected: string, actual: string): void {
    this.assertValidSnapshotId(expected);
    this.assertValidSnapshotId(actual);
    if (expected !== actual) {
      throw new Error(`Snapshot artifact mismatch. expected=${expected}, actual=${actual}`);
    }
  }

  private assertInsideDirectory(parentDir: string, candidatePath: string, label: string): void {
    const relative = path.relative(path.resolve(parentDir), path.resolve(candidatePath));
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      return;
    }

    throw new Error(`${label} escapes allowed directory: ${candidatePath}`);
  }

  private assertAllowedWorkspacePath(absolutePath: string, originalPath: string): void {
    const relativePath = path.relative(this.projectRoot, absolutePath);
    const segments = relativePath.split(path.sep).filter(Boolean);

    if (segments.some((segment) => EXCLUDED_PATH_SEGMENTS.has(segment))) {
      throw new Error(`Excluded workspace path cannot be stored in snapshot manifest: ${originalPath}`);
    }
  }
}
