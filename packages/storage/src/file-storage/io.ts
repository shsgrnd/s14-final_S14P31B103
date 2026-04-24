import * as fs from 'fs/promises';
import * as path from 'path';
import { flattenPath } from './path-utils';

const GITCAT_SNAPSHOTS_DIR = '.vscode/gitcat/snapshots';

/**
 * TODO(core-storage):
 * 현재 file-storage는 snapshot originals만 다룬다.
 *
 * 문서 기준으로 이후 Core 담당자가 확장해야 할 후보:
 * - writeSnapshotMetadata / readSnapshotMetadata
 *   -> .vscode/gitcat/snapshots/{snapshotId}/metadata.json
 * - writeWorkingDiff / readWorkingDiff
 *   -> diff://local/{session_id}/working.diff
 * - writeAiResponse / readAiResponse
 *   -> response://local/{ai_request_id}/raw.json
 * - writePatchFile / readPatchFile
 *   -> patch://local/{proposal_id}/merge.patch
 * - writeFinalCode / readFinalCode
 *   -> code://local/{feedback_id}/final.ts
 *
 * 인프라/AI 담당자는 AI 저장 계약 관점에서 ref 형식만 먼저 제안했고,
 * 실제 함수 시그니처와 디렉터리 책임 분리는 Core 담당자와 합의 후 구현한다.
 */

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
