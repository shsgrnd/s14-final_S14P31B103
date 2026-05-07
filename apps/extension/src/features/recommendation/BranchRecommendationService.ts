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
  projectId: string;
  sessionId?: string | null;
}

interface BranchRecommendationAiResponse {
  names: string[];
  generationBasisSummary: string;
}

/**
 * 브랜치 추천 생성 진입점
 * Git raw data, 과거 추천 이력, AI 입력 payload 구성 담당
 */
export class BranchRecommendationService {
  private readonly historyRepository?: RecommendationHistoryRepository;
  private readonly projectId: string;
  private readonly sessionId: string | null;

  constructor(
    private readonly gitService: GitService,
    options: BranchRecommendationServiceOptions,
  ) {
    this.historyRepository = options.historyRepository;
    this.projectId = options.projectId;
    this.sessionId = options.sessionId ?? null;
  }

  public async recommendBranch(
    request: BranchRecommendationRequestDto,
  ): Promise<BranchRecommendationResultDto> {
    // Git 상태 및 브랜치 목록 수집
    const input = await this.buildInput(request);

    // AI provider 호출 직전 raw payload 구성
    const rawPayload = await this.buildRawPayload(input);
    console.log('[GitCat] Branch recommendation raw payload prepared:', rawPayload);

    // 실제 AI 호출 지점
    const aiResponse = await this.requestBranchNames(rawPayload);

    // AI 응답 기반 recommendation_histories 저장
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
    // 현재 브랜치 및 전체 브랜치 목록 수집
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
    // AI 공통 입력 필수값 project_id 방어
    if (!this.projectId) {
      throw new Error('project_id가 없어 브랜치 추천 AI 요청을 생성할 수 없습니다.');
    }

    return {
      project_id: this.projectId,
      session_id: this.sessionId,
      recommendation_type: 'branch_name',
      work_intent: input.purpose,
      current_branch: input.currentBranch,
      existing_branches: input.existingBranches,
      recent_histories: await this.getRecentHistoryContext(),
      ai_provider_status: 'not_connected',
      schema_version: '1.0',
    };
  }

  private async getRecentHistoryContext(): Promise<BranchRecommendationHistoryContextDto[]> {
    if (!this.historyRepository) {
      return [];
    }

    // 같은 추천 타입의 최근 이력 조회
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
    // 실제 AI provider 호출 연결 지점
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

    // 대표 추천값 및 대안 추천값 분리 저장
    const [primaryName, ...alternativeNames] = response.names;
    const saved = await this.historyRepository.insert({
      project_id: this.projectId,
      recommendation_type: 'branch_name',
      input_summary: JSON.stringify({
        workIntent: payload.work_intent,
        currentBranch: payload.current_branch,
        existingBranchCount: payload.existing_branches.length,
        recentHistoryCount: payload.recent_histories.length,
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
