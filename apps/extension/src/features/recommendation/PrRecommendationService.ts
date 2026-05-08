import type {
  AiInputPayload,
  CreateRecommendationHistoryInput,
  RecommendationHistory,
  RecommendationHistoryRepository,
  RecommendationHistoryRow,
  RecommendationResult,
} from '@gitcat/shared-types';
import { MergeAiService } from '@gitcat/ai-pipeline';
import { GitService } from '../git/GitService';
import { RecommendationHistoryQueryService } from './RecommendationHistoryQueryService';
import type { PrRecommendationRawDataDto, PrRecommendationResultDto } from './PrRecommendationDto';

interface PrRecommendationAiResponse {
  title: string;
  markdown: string;
  generationBasisSummary: string | null;
  alternativeTexts: string[];
  warnings?: string[];
}

/**
 * PR 설명 추천 요청 처리 서비스
 * Git raw data 수집, AI 입력 payload 구성, AI 응답 변환, 추천 이력 저장 담당
 */
export class PrRecommendationService {
  constructor(
    private readonly gitService: GitService,
    private readonly aiService: MergeAiService,
    private readonly historyRepository: RecommendationHistoryRepository,
    private readonly projectId: string,
    /** 추천 이력 참고 Query 서비스 */
    private readonly historyQueryService: RecommendationHistoryQueryService,
  ) { }

  /**
   * 추천 이력 DB 저장
   */
  async saveRecommendationHistory(
    input: CreateRecommendationHistoryInput,
  ): Promise<RecommendationHistoryRow> {
    return this.historyRepository.insert(input);
  }

  /**
   * 최근 추천 이력 조회
   */
  async listRecentRecommendationHistory(
    projectId: string,
    type: RecommendationHistoryRow['recommendation_type'],
    limit?: number,
  ): Promise<RecommendationHistoryRow[]> {
    return this.historyRepository.listRecentByType(projectId, type, limit);
  }

  /**
   * AI 입력 참고용 추천 이력 컨텍스트 구성
   */
  async buildHistoryContext(
    projectId: string,
    recommendationType: RecommendationHistoryRow['recommendation_type'],
    limit?: number,
  ): Promise<RecommendationHistory[]> {
    const contexts = await this.historyQueryService.getRecentContext(
      projectId,
      recommendationType,
      limit,
    );

    return contexts.map((ctx) => ({
      recommendation_id: ctx.recommendation_id,
      ai_request_id: '',
      recommendation_type: ctx.recommendation_type as any,
      result_summary: ctx.input_summary ?? undefined,
      result_text: ctx.result_text,
      created_at: ctx.created_at,
    }));
  }

  /**
   * PR description 추천 실행
   */
  async recommendPR(base: string): Promise<PrRecommendationResultDto> {
    // PR 추천용 Git raw data 수집
    const rawData = await this.collectRawData(base);

    // AI 파이프라인 입력 payload 구성
    const payload = await this.buildAiPayload(rawData);

    // AI 요청 및 추천 결과 변환
    const aiResponse = await this.requestPrSuggestion(payload);

    // 추천 결과 이력 저장
    await this.saveHistory(payload, aiResponse);

    return {
      title: aiResponse.title,
      markdown: aiResponse.markdown,
    };
  }

  private async collectRawData(base: string): Promise<PrRecommendationRawDataDto> {
    // 현재 브랜치 확인
    const status = await this.gitService.getStatus();
    const currentBranch = status.currentBranch;
    if (!currentBranch) {
      throw new Error('현재 브랜치를 확인할 수 없어 PR 추천을 실행할 수 없습니다.');
    }

    const [diffText, diffFiles, commits] = await Promise.all([
      this.gitService.getDiffText(base, currentBranch),
      this.gitService.getDiff(base, currentBranch),
      this.gitService.getLogBetween(base, currentBranch),
    ]);

    const changedFiles = diffFiles.map((file) => file.filePath).filter(Boolean);
    if (changedFiles.length === 0) {
      throw new Error(`${base} 기준으로 PR 설명을 추천할 변경 파일이 없습니다.`);
    }

    return {
      baseBranch: base,
      currentBranch,
      diffText,
      changedFiles,
      commits: commits.map((commit) => ({
        hash: commit.hash,
        shortHash: commit.shortHash,
        message: commit.message,
        author: commit.author,
        date: commit.date,
        body: commit.body,
      })),
    };
  }

  private async buildAiPayload(rawData: PrRecommendationRawDataDto): Promise<AiInputPayload> {
    // AI 공통 입력 필수값인 project_id 방어
    if (!this.projectId) {
      throw new Error('project_id가 없어 PR 추천 AI 요청을 만들 수 없습니다.');
    }

    const historyContext = await this.buildHistoryContext(this.projectId, 'pr_description', 5);

    return {
      project_id: this.projectId,
      session_id: null,
      feature_type: 'recommendation',
      recommendation_type: 'pr_description',
      current_branch: rawData.currentBranch,
      change_summary: `PR from ${rawData.currentBranch} to ${rawData.baseBranch}`,
      changed_files: rawData.changedFiles,
      work_intent: `Create PR description for changes between ${rawData.baseBranch} and ${rawData.currentBranch}`,
      diff_summary: rawData.diffText,
      branch_context: [
        `Base branch: ${rawData.baseBranch}`,
        `Current branch: ${rawData.currentBranch}`,
        `Commits:\n${rawData.commits.map((commit) => `- ${commit.shortHash} ${commit.message}`).join('\n')}`,
        `Recent PR recommendation count: ${historyContext.length}`,
      ].join('\n'),
      schema_version: '1.0',
    };
  }

  private async requestPrSuggestion(
    payload: AiInputPayload,
  ): Promise<PrRecommendationAiResponse> {
    const parsedResult = (await this.aiService.processMergeRequest(payload)) as RecommendationResult;

    if (!parsedResult.primary_text.trim()) {
      throw new Error('PR 추천 AI 응답에 추천 설명이 없습니다.');
    }

    return {
      title: parsedResult.title,
      markdown: parsedResult.primary_text,
      generationBasisSummary: parsedResult.generation_basis_summary ?? null,
      alternativeTexts: parsedResult.alternative_texts,
      warnings: parsedResult.warnings,
    };
  }

  private async saveHistory(
    payload: AiInputPayload,
    response: PrRecommendationAiResponse,
  ): Promise<void> {
    await this.saveRecommendationHistory({
      project_id: this.projectId,
      session_id: payload.session_id,
      recommendation_type: 'pr_description',
      input_summary: payload.change_summary ?? payload.work_intent ?? null,
      result_text: response.markdown,
      alternative_texts: response.alternativeTexts,
      generation_basis_summary: response.generationBasisSummary,
      warnings: response.warnings,
    });
  }

  private extractChangedFiles(diffText: string): string[] {
    const files = new Set<string>();

    // git diff 헤더에서 변경 파일 경로 추출
    for (const line of diffText.split('\n')) {
      if (line.startsWith('diff --git ')) {
        const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
        if (match?.[2]) {
          files.add(match[2]);
        }
      }
    }

    return [...files];
  }
}
