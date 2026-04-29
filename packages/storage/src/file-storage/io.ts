import * as fs from 'fs/promises';
import * as path from 'path';
import { flattenPath } from './path-utils';

const GITCAT_SNAPSHOTS_DIR = '.vscode/gitcat/snapshots';
const GITCAT_MERGE_SESSIONS_DIR = '.vscode/gitcat/merge-sessions';
const GITCAT_TRAINING_CANDIDATES_DIR = '.vscode/gitcat/training-candidates';

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
 * - readFinalCode
 *   -> code://local/{feedback_id}/final.ts
 *
 * 인프라/AI 담당자는 AI 저장 계약 관점에서 ref 형식을 먼저 제안했고,
 * 현재는 merge_patch_draft proposal artifact와 feedback final code artifact까지 구현했다.
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

function getFeedbackArtifactDir(
  workspaceRoot: string,
  sessionId: string,
  feedbackId: string,
): string {
  // proposal 원본 artifact와 사용자의 최종 채택본을 분리하기 위해
  // feedback 결과물은 feedback_id 기준의 별도 폴더에 저장합니다.
  return path.join(
    workspaceRoot,
    GITCAT_MERGE_SESSIONS_DIR,
    sessionId,
    'feedback-results',
    feedbackId,
  );
}

function getTrainingCandidateArtifactDir(
  workspaceRoot: string,
  trainingCandidateId: string,
): string {
  // training candidate는 session/proposal과 분리된 별도 수집 단위이므로
  // training_candidate_id 기준 전용 폴더에 모아 둡니다.
  return path.join(
    workspaceRoot,
    GITCAT_TRAINING_CANDIDATES_DIR,
    trainingCandidateId,
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

export async function writeFinalCodeFile(
  workspaceRoot: string,
  sessionId: string,
  feedbackId: string,
  relativeFilePath: string | undefined,
  content: string,
): Promise<StoredArtifactRef> {
  const targetDir = getFeedbackArtifactDir(workspaceRoot, sessionId, feedbackId);
  // 최종 코드가 특정 파일에 대응되면 원래 파일 경로를 이름에 남기고,
  // 그렇지 않으면 generic 파일명으로 저장합니다.
  const flattenedName = relativeFilePath
    ? `final__${flattenPath(relativeFilePath)}`
    : 'final_code.txt';
  const fileName = normalizeArtifactFileName(flattenedName);

  await fs.mkdir(targetDir, { recursive: true });

  const absolutePath = path.join(targetDir, fileName);
  await fs.writeFile(absolutePath, content, 'utf8');

  return {
    ref: `code://local/${feedbackId}/${fileName}`,
    absolute_path: absolutePath,
  };
}

async function writeTrainingCandidateArtifactFile(
  workspaceRoot: string,
  trainingCandidateId: string,
  fileName: string,
  content: string,
  refPrefix: 'prompt' | 'chosen' | 'rejected',
): Promise<StoredArtifactRef> {
  const targetDir = getTrainingCandidateArtifactDir(workspaceRoot, trainingCandidateId);
  const normalizedFileName = normalizeArtifactFileName(fileName);

  await fs.mkdir(targetDir, { recursive: true });

  const absolutePath = path.join(targetDir, normalizedFileName);
  await fs.writeFile(absolutePath, content, 'utf8');

  return {
    ref: `${refPrefix}://local/${trainingCandidateId}/${normalizedFileName}`,
    absolute_path: absolutePath,
  };
}

export async function writeTrainingPromptFile(
  workspaceRoot: string,
  trainingCandidateId: string,
  content: string,
): Promise<StoredArtifactRef> {
  // prompt artifact는 사람이 다시 읽고 비교하기 쉬운 텍스트 파일로 저장합니다.
  return writeTrainingCandidateArtifactFile(
    workspaceRoot,
    trainingCandidateId,
    'prompt.txt',
    content,
    'prompt',
  );
}

export async function writeTrainingChosenFile(
  workspaceRoot: string,
  trainingCandidateId: string,
  content: string,
): Promise<StoredArtifactRef> {
  // chosen/rejected는 feature별 구조가 달라질 수 있어
  // 공통 래퍼 JSON 파일로 저장해 후속 export 단계에서 재해석 가능하게 둡니다.
  return writeTrainingCandidateArtifactFile(
    workspaceRoot,
    trainingCandidateId,
    'chosen.json',
    content,
    'chosen',
  );
}

export async function writeTrainingRejectedFile(
  workspaceRoot: string,
  trainingCandidateId: string,
  content: string,
): Promise<StoredArtifactRef> {
  return writeTrainingCandidateArtifactFile(
    workspaceRoot,
    trainingCandidateId,
    'rejected.json',
    content,
    'rejected',
  );
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

export function resolveFinalCodeArtifactPath(
  workspaceRoot: string,
  sessionId: string,
  feedbackId: string,
  ref: string,
): string {
  // final_code_ref는 code://local/{feedback_id}/{fileName} 규칙만 허용합니다.
  // feedback_id가 다르면 다른 선택 결과를 잘못 읽는 상황이므로 바로 막습니다.
  const match = ref.match(/^code:\/\/local\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Unsupported final code artifact ref: ${ref}`);
  }

  const [, refFeedbackId, rawFileName] = match;
  if (refFeedbackId !== feedbackId) {
    throw new Error(
      `Artifact ref feedback_id mismatch: expected ${feedbackId}, received ${refFeedbackId}`,
    );
  }

  const fileName = normalizeArtifactFileName(rawFileName);
  return path.join(getFeedbackArtifactDir(workspaceRoot, sessionId, feedbackId), fileName);
}

export function resolveTrainingCandidateArtifactPath(
  workspaceRoot: string,
  trainingCandidateId: string,
  ref: string,
): string {
  const match = ref.match(/^(prompt|chosen|rejected):\/\/local\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Unsupported training candidate artifact ref: ${ref}`);
  }

  const [, , refTrainingCandidateId, rawFileName] = match;
  if (refTrainingCandidateId !== trainingCandidateId) {
    throw new Error(
      `Artifact ref training_candidate_id mismatch: expected ${trainingCandidateId}, received ${refTrainingCandidateId}`,
    );
  }

  const fileName = normalizeArtifactFileName(rawFileName);
  return path.join(
    getTrainingCandidateArtifactDir(workspaceRoot, trainingCandidateId),
    fileName,
  );
}
