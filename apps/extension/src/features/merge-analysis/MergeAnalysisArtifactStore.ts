import * as fs from 'fs/promises';
import * as path from 'path';

export interface MergeAnalysisArtifactWriteResult {
  relativePath: string;
  absolutePath: string;
}

export interface MergeFeedbackArtifactWriteResult {
  feedbackId: string;
  finalCodeRef: string;
  relativePath: string;
  absolutePath: string;
}

const MERGE_SESSIONS_DIR = '.vscode/gitcat/merge-sessions';

/**
 * 병합 분석 산출물을 로컬 파일 저장소에 기록합니다.
 *
 * DB에는 artifact path만 남기고, diff 원문과 후보 상세 설명은 analysis.json에 보관합니다.
 */
export class MergeAnalysisArtifactStore {
  async writeAnalysis(
    workspaceRoot: string,
    analysisId: string,
    data: unknown,
  ): Promise<MergeAnalysisArtifactWriteResult> {
    const safeAnalysisId = this.validateAnalysisId(analysisId);
    const relativePath = path.posix.join(
      MERGE_SESSIONS_DIR,
      safeAnalysisId,
      'analysis.json',
    );
    const absolutePath = this.resolveInsideWorkspace(workspaceRoot, relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, JSON.stringify(data, null, 2), 'utf8');

    return { relativePath, absolutePath };
  }

  async readAnalysis<T = unknown>(
    workspaceRoot: string,
    analysisId: string,
  ): Promise<T> {
    const safeAnalysisId = this.validateAnalysisId(analysisId);
    const relativePath = path.posix.join(
      MERGE_SESSIONS_DIR,
      safeAnalysisId,
      'analysis.json',
    );
    const absolutePath = this.resolveInsideWorkspace(workspaceRoot, relativePath);
    const text = await fs.readFile(absolutePath, 'utf8');
    return JSON.parse(text) as T;
  }

  async writeProposals(
    workspaceRoot: string,
    analysisId: string,
    data: unknown,
  ): Promise<MergeAnalysisArtifactWriteResult> {
    const safeAnalysisId = this.validateAnalysisId(analysisId);
    const relativePath = path.posix.join(
      MERGE_SESSIONS_DIR,
      safeAnalysisId,
      'proposals.json',
    );
    const absolutePath = this.resolveInsideWorkspace(workspaceRoot, relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, JSON.stringify(data, null, 2), 'utf8');

    return { relativePath, absolutePath };
  }

  async readProposals<T = unknown>(
    workspaceRoot: string,
    analysisId: string,
  ): Promise<T | null> {
    const safeAnalysisId = this.validateAnalysisId(analysisId);
    const relativePath = path.posix.join(
      MERGE_SESSIONS_DIR,
      safeAnalysisId,
      'proposals.json',
    );
    const absolutePath = this.resolveInsideWorkspace(workspaceRoot, relativePath);

    try {
      const text = await fs.readFile(absolutePath, 'utf8');
      return JSON.parse(text) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async writeContextBundle(
    workspaceRoot: string,
    analysisId: string,
    data: unknown,
  ): Promise<MergeAnalysisArtifactWriteResult> {
    const safeAnalysisId = this.validateAnalysisId(analysisId);
    const relativePath = path.posix.join(
      MERGE_SESSIONS_DIR,
      safeAnalysisId,
      'context-bundle.json',
    );
    const absolutePath = this.resolveInsideWorkspace(workspaceRoot, relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, JSON.stringify(data, null, 2), 'utf8');

    return { relativePath, absolutePath };
  }

  async readContextBundle<T = unknown>(
    workspaceRoot: string,
    analysisId: string,
  ): Promise<T | null> {
    const safeAnalysisId = this.validateAnalysisId(analysisId);
    const relativePath = path.posix.join(
      MERGE_SESSIONS_DIR,
      safeAnalysisId,
      'context-bundle.json',
    );
    const absolutePath = this.resolveInsideWorkspace(workspaceRoot, relativePath);

    try {
      const text = await fs.readFile(absolutePath, 'utf8');
      return JSON.parse(text) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async writeFeedbackFinalCode(
    workspaceRoot: string,
    analysisId: string,
    feedbackId: string,
    proposedContent: string,
  ): Promise<MergeFeedbackArtifactWriteResult> {
    const safeAnalysisId = this.validateAnalysisId(analysisId);
    const safeFeedbackId = this.validateAnalysisId(feedbackId);
    const relativePath = path.posix.join(
      MERGE_SESSIONS_DIR,
      safeAnalysisId,
      'feedback-results',
      safeFeedbackId,
      'final-code.txt',
    );
    const absolutePath = this.resolveInsideWorkspace(workspaceRoot, relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, proposedContent, 'utf8');

    return {
      feedbackId: safeFeedbackId,
      finalCodeRef: relativePath,
      relativePath,
      absolutePath,
    };
  }

  private validateAnalysisId(analysisId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(analysisId)) {
      throw new Error(`Invalid merge analysis id: ${analysisId}`);
    }
    return analysisId;
  }

  private resolveInsideWorkspace(workspaceRoot: string, relativePath: string): string {
    const root = path.resolve(workspaceRoot);
    const absolutePath = path.resolve(root, relativePath);
    const isInsideWorkspace = absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`);

    if (!isInsideWorkspace) {
      throw new Error('Merge analysis artifact path must stay inside the workspace.');
    }

    return absolutePath;
  }
}
