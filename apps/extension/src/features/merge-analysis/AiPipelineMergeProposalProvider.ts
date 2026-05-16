import * as fs from 'fs/promises';
import { resolveProposalArtifactPath } from '@gitcat/storage';
import type { MergeProposalInput, ParsedAiResult } from '@gitcat/shared-types';
import type {
  GeneratedMergeProposal,
  MergeProposalProvider,
  MergeProposalProviderInput,
} from './MergeProposalService';

type MergeParsedAiResult = Exclude<ParsedAiResult, { feature_type: 'recommendation' }>;

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
  ) { }

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

    return this.buildFallbackProposedContent(input);
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

  private buildFallbackProposedContent(input: MergeProposalProviderInput): string {
    // merged artifact read에 실패하면 화면이 완전히 비지 않도록 기존 후보 코드 조합을 마지막 fallback으로 사용합니다.
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
