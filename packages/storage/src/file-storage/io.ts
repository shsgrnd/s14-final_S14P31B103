import * as fs from 'fs/promises';
import * as path from 'path';
import { flattenPath } from './path-utils';

const GITCAT_SNAPSHOTS_DIR = '.vscode/gitcat/snapshots';

/**
 * 특정 스냅샷 ID 폴더(originals)에 파일을 복사(저장)합니다.
 */
export async function writeSnapshotFile(
  workspaceRoot: string,
  snapshotId: string,
  relativeFilePath: string,
  content: string
): Promise<void> {
  const flattenedName = flattenPath(relativeFilePath);
  const targetDir = path.join(workspaceRoot, GITCAT_SNAPSHOTS_DIR, snapshotId, 'originals');
  
  // 스냅샷 원본 폴더가 없으면 생성
  await fs.mkdir(targetDir, { recursive: true });
  
  const targetPath = path.join(targetDir, flattenedName);
  await fs.writeFile(targetPath, content, 'utf8');
}

/**
 * 특정 스냅샷 ID 폴더에서 파일을 읽어옵니다.
 */
export async function readSnapshotFile(
  workspaceRoot: string,
  snapshotId: string,
  relativeFilePath: string
): Promise<string> {
  const flattenedName = flattenPath(relativeFilePath);
  const targetPath = path.join(workspaceRoot, GITCAT_SNAPSHOTS_DIR, snapshotId, 'originals', flattenedName);
  
  return await fs.readFile(targetPath, 'utf8');
}
