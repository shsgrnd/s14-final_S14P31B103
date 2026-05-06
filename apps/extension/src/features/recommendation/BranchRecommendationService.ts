import type { RecommendationHistoryRepository, RecommendationHistoryRow } from '@gitcat/shared-types';
import { GitService } from '../git/GitService';
import {
  BranchRecommendationHistoryContextDto,
  BranchRecommendationInputDto,
  BranchRecommendationRawPayloadDto,
  BranchRecommendationRequestDto,
  BranchRecommendationResultDto,
} from './BranchRecommendationDto';

interface BranchRecommendationServiceOptions {
  historyRepository?: RecommendationHistoryRepository;
  projectId?: string;
}

interface BranchRecommendationAiResponse {
  names: string[];
  generationBasisSummary: string;
}

/**
 * 브랜치 추천 생성 진입점입니다.
 * Git raw data와 과거 추천 이력을 모아 AI 입력 payload를 만들고,
 * 현재 단계에서는 외부 AI 호출을 구현하지 않고, AI 입력 직전 payload까지만 준비합니다.
 */
export class BranchRecommendationService {
  private readonly historyRepository?: RecommendationHistoryRepository;
  private readonly projectId: string | null;

  constructor(
    private readonly gitService: GitService,
    options: BranchRecommendationServiceOptions = {},
  ) {
    this.historyRepository = options.historyRepository;
    this.projectId = options.projectId ?? null;
  }

  public async recommendBranch(
    request: BranchRecommendationRequestDto,
  ): Promise<BranchRecommendationResultDto> {
    const input = await this.buildInput(request);
    const rawPayload = await this.buildRawPayload(input);
    console.log('[GitCat] Branch recommendation raw payload prepared:', rawPayload);

    const aiResponse = await this.requestBranchNames(rawPayload);
    const historyId = await this.saveHistory(rawPayload, aiResponse);

    return {
      names: aiResponse.names,
      historyId,
      rawPayload,
      generationBasisSummary: aiResponse.generationBasisSummary,
      warnings: [],
    };
  }

  private async buildInput(
    request: BranchRecommendationRequestDto,
  ): Promise<BranchRecommendationInputDto> {
    const [status, branches] = await Promise.all([
      this.gitService.getStatus(),
      this.gitService.getBranches(),
    ]);

    return {
      purpose: request.purpose,
      currentBranch: status.currentBranch,
      existingBranches: branches.map((branch) => branch.name),
    };
  }

  private async buildRawPayload(
    input: BranchRecommendationInputDto,
  ): Promise<BranchRecommendationRawPayloadDto> {
    return {
      ...input,
      projectId: this.projectId,
      recommendationType: 'branch_name',
      recentHistories: await this.getRecentHistoryContext(),
      aiProviderStatus: 'not_connected',
      schemaVersion: '1.0',
    };
  }

  private async getRecentHistoryContext(): Promise<BranchRecommendationHistoryContextDto[]> {
    if (!this.historyRepository || !this.projectId) {
      return [];
    }

    const rows = await this.historyRepository.listRecentByType(this.projectId, 'branch_name', 5);
    return rows.map((row) => this.toHistoryContext(row));
  }

  private toHistoryContext(row: RecommendationHistoryRow): BranchRecommendationHistoryContextDto {
    return {
      recommendationId: row.recommendation_id,
      inputSummary: row.input_summary,
      resultText: row.result_text,
      alternativeTexts: this.parseJsonStringArray(row.alternative_texts_json),
      createdAt: row.created_at,
    };
  }

  private async requestBranchNames(
    payload: BranchRecommendationRawPayloadDto,
  ): Promise<BranchRecommendationAiResponse> {
    // 실제 AI provider 호출은 후속 AI 연동 단계에서 이 메서드 안쪽으로 연결합니다.
    void payload;
    throw new Error('브랜치 추천 AI provider가 아직 연결되지 않았습니다.');
  }

  private async saveHistory(
    payload: BranchRecommendationRawPayloadDto,
    response: BranchRecommendationAiResponse,
  ): Promise<string | undefined> {
    if (!this.historyRepository || !this.projectId) {
      return undefined;
    }

    const [primaryName, ...alternativeNames] = response.names;
    const saved = await this.historyRepository.insert({
      project_id: this.projectId,
      recommendation_type: 'branch_name',
      input_summary: JSON.stringify({
        purpose: payload.purpose,
        currentBranch: payload.currentBranch,
        existingBranchCount: payload.existingBranches.length,
        recentHistoryCount: payload.recentHistories.length,
      }),
      result_text: primaryName,
      alternative_texts: alternativeNames,
      generation_basis_summary: response.generationBasisSummary,
    });

    return saved.recommendation_id;
  }

  private parseJsonStringArray(value: string | null): string[] {
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
}
