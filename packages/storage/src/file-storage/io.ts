import * as fs from 'fs/promises';
import * as path from 'path';
import { flattenPath } from './path-utils';

const GITCAT_SNAPSHOTS_DIR = '.vscode/gitcat/snapshots';
const GITCAT_MERGE_SESSIONS_DIR = '.vscode/gitcat/merge-sessions';

/**
 * TODO(core-storage):
 * 현재 file-storage는 snapshot originals와 merge draft artifact 저장까지 다룬다.
 *
 * 문서 기준으로 이후 Core 담당자가 확장해야 할 후보:
 * - writeSnapshotMetadata / readSnapshotMetadata
 *   -> .vscode/gitcat/snapshots/{snapshotId}/metadata.json
 * - writeWorkingDiff / readWorkingDiff
 *   -> diff://local/{session_id}/working.diff
 * - writeAiResponse / readAiResponse
 *   -> response://local/{ai_request_id}/raw.json
 * - writeFinalCode / readFinalCode
 *   -> code://local/{feedback_id}/final.ts
 *
 * 인프라/AI 담당자는 AI 저장 계약 관점에서 ref 형식만 먼저 제안했고,
 * merge_patch_draft 시연용 patch/code artifact만 먼저 구현했다.
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

function getMergeProposalArtifactDir(
  workspaceRoot: string,
  sessionId: string,
  proposalId: string,
): string {
  return path.join(
    workspaceRoot,
    GITCAT_MERGE_SESSIONS_DIR,
    sessionId,
    'ai-results',
    proposalId,
  );
}

function normalizeArtifactFileName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/g, '_');
}

export interface StoredArtifactRef {
  ref: string;
  absolute_path: string;
}

export async function writeMergePatchFile(
  workspaceRoot: string,
  sessionId: string,
  proposalId: string,
  content: string,
): Promise<StoredArtifactRef> {
  const targetDir = getMergeProposalArtifactDir(workspaceRoot, sessionId, proposalId);
  const fileName = 'merge.patch';

  await fs.mkdir(targetDir, { recursive: true });

  const absolutePath = path.join(targetDir, fileName);
  await fs.writeFile(absolutePath, content, 'utf8');

  return {
    ref: `patch://local/${proposalId}/${fileName}`,
    absolute_path: absolutePath,
  };
}

export async function writeMergedCodeFile(
  workspaceRoot: string,
  sessionId: string,
  proposalId: string,
  relativeFilePath: string | undefined,
  content: string,
): Promise<StoredArtifactRef> {
  const targetDir = getMergeProposalArtifactDir(workspaceRoot, sessionId, proposalId);
  const flattenedName = relativeFilePath
    ? `merged__${flattenPath(relativeFilePath)}`
    : 'merged_code.txt';
  const fileName = normalizeArtifactFileName(flattenedName);

  await fs.mkdir(targetDir, { recursive: true });

  const absolutePath = path.join(targetDir, fileName);
  await fs.writeFile(absolutePath, content, 'utf8');

  return {
    ref: `code://local/${proposalId}/${fileName}`,
    absolute_path: absolutePath,
  };
}

export function resolveProposalArtifactPath(
  workspaceRoot: string,
  sessionId: string,
  proposalId: string,
  ref: string,
): string {
  const match = ref.match(/^(patch|code):\/\/local\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Unsupported local artifact ref: ${ref}`);
  }

  const [, , refProposalId, rawFileName] = match;
  if (refProposalId !== proposalId) {
    throw new Error(
      `Artifact ref proposal_id mismatch: expected ${proposalId}, received ${refProposalId}`,
    );
  }

  const fileName = normalizeArtifactFileName(rawFileName);
  return path.join(getMergeProposalArtifactDir(workspaceRoot, sessionId, proposalId), fileName);
}
