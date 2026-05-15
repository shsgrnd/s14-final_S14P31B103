import * as fs from 'fs/promises';
import * as path from 'path';
import { MergeAiService } from '@gitcat/ai-pipeline';
import type { AiInputPayload } from '@gitcat/shared-types';
import type {
  GeneratedMergeProposal,
  MergeProposalProvider,
  MergeProposalProviderInput,
} from './MergeProposalService';

export class AiPipelineMergeProposalProvider implements MergeProposalProvider {
  constructor(
    private readonly mergeAiService: MergeAiService,
    private readonly workspaceRoot: string,
  ) {}

  async generate(input: MergeProposalProviderInput): Promise<GeneratedMergeProposal[]> {
    // 1. Extension의 입력 모델을 AI 패키지가 요구하는 AiInputPayload로 변환
    const payload: AiInputPayload = {
      ...input.aiInput,
      // 이전 피드백 기록도 컨텍스트로 넘깁니다 (향후 프롬프트 개선용)
      previous_feedback: input.previousFeedback.length > 0 ? input.previousFeedback : undefined,
    } as any;

    // 2. 실제 LLM 추론 및 파싱 수행
    const parsedResult = await this.mergeAiService.processMergeRequest(payload, {
      workspaceRoot: this.workspaceRoot,
    });

    let proposedContent = '';

    // 3. 응답 종류에 따른 proposedContent 변환 처리
    if (parsedResult.feature_type === 'merge_patch_draft') {
      if (parsedResult.merged_code_ref) {
        // 케이스 A: AI가 완성된 전체 코드를 저장소에 남긴 경우
        try {
          const absolutePath = path.resolve(this.workspaceRoot, parsedResult.merged_code_ref);
          proposedContent = await fs.readFile(absolutePath, 'utf8');
        } catch (error) {
          console.error('Failed to read merged_code_ref file:', error);
          proposedContent = this.createFallbackContent(input, parsedResult.summary);
        }
      } else if (parsedResult.diff_patch_ref) {
        // 케이스 B: AI가 패치(diff)만 생성한 경우
        // 향후 patch 적용 로직 고도화 가능. 현재는 적용 실패 시나리오로 간주하여 fallback 처리.
        proposedContent = this.createFallbackContent(input, parsedResult.summary);
      } else {
        proposedContent = this.createFallbackContent(input, parsedResult.summary);
      }
    } else {
      proposedContent = this.createFallbackContent(input, parsedResult.summary);
    }

    return [{
      parsedResult: parsedResult as any,
      proposedContent,
      explanation: parsedResult.explanation ?? parsedResult.summary ?? '',
      sourceContent: input.candidate.source_code,
      targetContent: input.candidate.target_code,
    }];
  }

  /**
   * 파일 읽기나 패치 적용 실패 시 안전한 형태로 코드 초안을 만듭니다.
   */
  private createFallbackContent(input: MergeProposalProviderInput, summary?: string): string {
    const source = input.candidate.source_code.trim();
    const target = input.candidate.target_code.trim();
    return [
      `// [AI Fallback] ${summary ?? 'AI 응답을 전체 파일로 변환하지 못했습니다.'}`,
      `// 아래 코드를 참고하여 직접 병합을 진행해주세요.`,
      `<<<<<<< SOURCE (${input.analysis.source_branch})`,
      source,
      `=======`,
      target,
      `>>>>>>> TARGET (${input.analysis.target_branch})`
    ].join('\n');
  }
}
