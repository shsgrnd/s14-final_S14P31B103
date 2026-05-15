import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveProposalArtifactPath } from '@gitcat/storage';
import type { MergeProposalInput, ParsedAiResult } from '@gitcat/shared-types';
import type {
  GeneratedMergeProposal,
  MergeProposalProvider,
  MergeProposalProviderInput,
} from './MergeProposalService';

type MergeParsedAiResult = Exclude<ParsedAiResult, { feature_type: 'recommendation' }>;
type PatchLine = { kind: 'context' | 'remove' | 'add'; text: string };

interface ParsedPatchHunk {
  oldStart: number;
  lines: PatchLine[];
}

export interface MergeAiEngine {
  processMergeRequest(
    payload: MergeProposalInput,
    options?: { workspaceRoot?: string },
  ): Promise<ParsedAiResult>;
}

/**
 * ai-pipeline의 병합 결과를 Extension 병합 제안 저장/응답 DTO로 맞춰주는 어댑터입니다.
 */
export class AiPipelineMergeProposalProvider implements MergeProposalProvider {
  constructor(
    private readonly aiEngine: MergeAiEngine,
    private readonly workspaceRoot: string,
  ) {}

  async generate(input: MergeProposalProviderInput): Promise<GeneratedMergeProposal[]> {
    const parsedResult = await this.aiEngine.processMergeRequest(input.aiInput, {
      workspaceRoot: this.workspaceRoot,
    });

    if (parsedResult.feature_type === 'recommendation') {
      throw new Error('Merge proposal provider received recommendation result.');
    }

    const proposedContent = await this.resolveProposedContent(parsedResult, input);

    return [{
      parsedResult,
      proposedContent,
      explanation: this.toExplanation(parsedResult),
      sourceContent: input.candidate.source_code,
      targetContent: input.candidate.target_code,
    }];
  }

  private async resolveProposedContent(
    parsedResult: MergeParsedAiResult,
    input: MergeProposalProviderInput,
  ): Promise<string> {
    if (parsedResult.feature_type === 'merge_patch_draft' && parsedResult.merged_code_ref) {
      const mergedCode = await this.readProposalArtifactRef(
        input.analysis.session_id,
        parsedResult.proposal_id,
        parsedResult.merged_code_ref,
      );
      if (mergedCode) {
        return mergedCode;
      }
    }

    if (parsedResult.feature_type === 'merge_patch_draft' && parsedResult.diff_patch_ref) {
      const patchedContent = await this.resolvePatchedContent(parsedResult, input);
      if (patchedContent) {
        return patchedContent;
      }
    }

    return this.buildFallbackProposedContent(input);
  }

  private async resolvePatchedContent(
    parsedResult: Extract<MergeParsedAiResult, { feature_type: 'merge_patch_draft' }>,
    input: MergeProposalProviderInput,
  ): Promise<string | undefined> {
    if (!parsedResult.diff_patch_ref) {
      return undefined;
    }

    const patchText = await this.readProposalArtifactRef(
      input.analysis.session_id,
      parsedResult.proposal_id,
      parsedResult.diff_patch_ref,
    );
    if (!patchText) {
      return undefined;
    }

    const currentContent = await this.readWorkspaceFile(input.candidate.file_path);
    if (currentContent === undefined) {
      return undefined;
    }

    return this.applyUnifiedDiff(currentContent, patchText, input.candidate.file_path);
  }

  private async readProposalArtifactRef(
    sessionId: string,
    proposalId: string,
    artifactRef: string,
  ): Promise<string | undefined> {
    try {
      const artifactPath = resolveProposalArtifactPath(
        this.workspaceRoot,
        sessionId,
        proposalId,
        artifactRef,
      );
      return await fs.readFile(artifactPath, 'utf8');
    } catch (error) {
      console.warn('GitCat merge AI artifact ref read failed:', error);
      return undefined;
    }
  }

  private async readWorkspaceFile(filePath: string): Promise<string | undefined> {
    try {
      return await fs.readFile(this.resolveWorkspaceFilePath(filePath), 'utf8');
    } catch (error) {
      console.warn('GitCat merge AI workspace file read failed:', error);
      return undefined;
    }
  }

  private applyUnifiedDiff(
    originalContent: string,
    patchText: string,
    filePath: string,
  ): string | undefined {
    const patchSection = this.extractPatchSection(patchText, filePath);
    const hunks = this.parsePatchHunks(patchSection);
    if (hunks.length === 0) {
      return undefined;
    }

    const originalLines = originalContent.split(/\r?\n/);
    const output: string[] = [];
    let cursor = 0;

    for (const hunk of hunks) {
      const hunkStart = Math.max(hunk.oldStart - 1, 0);
      if (hunkStart < cursor) {
        return undefined;
      }

      output.push(...originalLines.slice(cursor, hunkStart));
      cursor = hunkStart;

      for (const line of hunk.lines) {
        if (line.kind === 'add') {
          output.push(line.text);
          continue;
        }

        if (cursor >= originalLines.length || originalLines[cursor] !== line.text) {
          return undefined;
        }

        if (line.kind === 'context') {
          output.push(originalLines[cursor]);
        }
        cursor += 1;
      }
    }

    output.push(...originalLines.slice(cursor));
    return output.join('\n');
  }

  private extractPatchSection(patchText: string, filePath: string): string {
    const normalizedFilePath = filePath.replace(/\\/g, '/');
    const sections = patchText.split(/^diff --git /m);
    if (sections.length <= 1) {
      return patchText;
    }

    for (const section of sections.slice(1)) {
      const fullSection = `diff --git ${section}`;
      if (
        fullSection.includes(` a/${normalizedFilePath} b/${normalizedFilePath}`)
        || fullSection.includes(`+++ b/${normalizedFilePath}`)
        || fullSection.includes(`+++ ${normalizedFilePath}`)
      ) {
        return fullSection;
      }
    }

    return patchText;
  }

  private parsePatchHunks(patchText: string): ParsedPatchHunk[] {
    const hunks: ParsedPatchHunk[] = [];
    let current: ParsedPatchHunk | null = null;

    for (const rawLine of patchText.split(/\r?\n/)) {
      const hunkMatch = rawLine.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
      if (hunkMatch) {
        current = {
          oldStart: Number(hunkMatch[1]),
          lines: [],
        };
        hunks.push(current);
        continue;
      }

      if (!current || rawLine.startsWith('\\')) {
        continue;
      }

      if (rawLine.startsWith(' ')) {
        current.lines.push({ kind: 'context', text: rawLine.slice(1) });
      } else if (rawLine.startsWith('-')) {
        current.lines.push({ kind: 'remove', text: rawLine.slice(1) });
      } else if (rawLine.startsWith('+')) {
        current.lines.push({ kind: 'add', text: rawLine.slice(1) });
      }
    }

    return hunks;
  }

  private resolveWorkspaceFilePath(filePath: string): string {
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (path.isAbsolute(normalizedPath)) {
      throw new Error('Merge proposal file path must be relative to the workspace.');
    }

    const root = path.resolve(this.workspaceRoot);
    const absolutePath = path.resolve(root, normalizedPath);
    const isInsideWorkspace = absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`);
    if (!isInsideWorkspace) {
      throw new Error('Merge proposal file path must stay inside the workspace.');
    }

    return absolutePath;
  }

  private buildFallbackProposedContent(input: MergeProposalProviderInput): string {
    // patch 적용에 실패하면 patch 문자열을 파일 본문으로 쓰지 않고 기존 후보 코드 조합을 안전한 초안으로 사용합니다.
    return [
      input.candidate.source_code.trim(),
      input.candidate.target_code.trim(),
    ].filter(Boolean).join('\n');
  }

  private toExplanation(parsedResult: MergeParsedAiResult): string {
    switch (parsedResult.feature_type) {
      case 'merge_patch_draft':
        return parsedResult.explanation ?? parsedResult.validation_summary;
      case 'conflict_explanation':
        return parsedResult.detailed_explanation;
      case 'merge_mediation':
        return [
          parsedResult.recommended_option,
          parsedResult.recommended_next_action,
          ...parsedResult.tradeoffs,
        ].filter(Boolean).join('\n');
    }
  }
}
