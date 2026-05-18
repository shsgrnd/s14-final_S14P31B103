import type {
  AiInputPayload,
  InboundPayloadByType,
  RecommendationHistoryRepository,
  RecommendationHistoryRow,
  RecommendationResult,
} from '@gitcat/shared-types';
import { MergeAiService } from '@gitcat/ai-pipeline/extension';
import { GitService } from '../git/GitService';
import {
  BranchRecommendationHistoryContextDto,
  BranchRecommendationInputDto,
  BranchRecommendationRawPayloadDto,
  BranchRecommendationResultDto,
} from './BranchRecommendationDto';

type BranchRecommendationRequest = InboundPayloadByType['RECOMMEND_BRANCH'];

interface BranchRecommendationServiceOptions {
  historyRepository?: RecommendationHistoryRepository;
  projectId: string;
  sessionId?: string | null;
  aiService?: MergeAiService;
}

interface BranchRecommendationAiResponse {
  names: string[];
  generationBasisSummary: string;
}

/**
 * 브랜치명 추천 요청 처리 서비스
 * Git raw data 수집, AI 입력 payload 구성, AI 응답 변환, 추천 이력 저장 담당
 */
export class BranchRecommendationService {
  private readonly historyRepository?: RecommendationHistoryRepository;
  private readonly projectId: string;
  private readonly sessionId: string | null;
  private readonly aiService?: MergeAiService;

  constructor(
    private readonly gitService: GitService,
    options: BranchRecommendationServiceOptions,
  ) {
    this.historyRepository = options.historyRepository;
    this.projectId = options.projectId;
    this.sessionId = options.sessionId ?? null;
    this.aiService = options.aiService;
  }

  public async recommendBranch(
    request: BranchRecommendationRequest,
  ): Promise<BranchRecommendationResultDto> {
    // Git 상태와 기존 브랜치 목록 수집
    const input = await this.buildInput(request);

    // Extension 내부 raw payload 구성
    const rawPayload = await this.buildRawPayload(input);
    console.log('[GitCat] Branch recommendation raw payload prepared:', rawPayload);

    // AI 요청 및 추천 결과 변환
    const aiResponse = await this.requestBranchNames(rawPayload);

    // 추천 결과 이력 저장
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
    request: BranchRecommendationRequest,
  ): Promise<BranchRecommendationInputDto> {
    // 현재 브랜치와 기존 브랜치 목록 수집
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
    // AI 공통 입력 필수값인 project_id 방어
    if (!this.projectId) {
      throw new Error('project_id가 없어 브랜치 추천 AI 요청을 만들 수 없습니다.');
    }

    return {
      project_id: this.projectId,
      session_id: this.sessionId,
      recommendation_type: 'branch_name',
      work_intent: input.purpose,
      current_branch: input.currentBranch,
      existing_branches: input.existingBranches,
      recent_histories: await this.getRecentHistoryContext(),
      ai_provider_status: this.aiService ? 'ready' : 'not_connected',
      schema_version: '1.0',
    };
  }

  private buildAiPayload(payload: BranchRecommendationRawPayloadDto): AiInputPayload {
    // 브랜치 추천은 diff 기반이 아니므로 change_summary/changed_files를 임시로 채우지 않음
    return {
      project_id: payload.project_id,
      session_id: payload.session_id,
      feature_type: 'recommendation',
      recommendation_type: 'branch_name',
      current_branch: payload.current_branch,
      work_intent: payload.work_intent,
      branch_context: [
        `Existing branches: ${payload.existing_branches.join(', ') || 'none'}`,
        `Recent branch recommendation count: ${payload.recent_histories.length}`,
      ].join('\n'),
      naming_constraints: [
        'Return branch names only',
        'Use git-friendly lowercase words separated by slash or hyphen',
        'Avoid duplicating existing branch names',
      ],
      schema_version: payload.schema_version,
    };
  }

  private async getRecentHistoryContext(): Promise<BranchRecommendationHistoryContextDto[]> {
    if (!this.historyRepository) {
      return [];
    }

    // 같은 추천 유형의 최근 이력 참고
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
    if (!this.aiService) {
      throw new Error('브랜치 추천 AI provider가 연결되지 않았습니다.');
    }

    const result = (await this.aiService.processMergeRequest(
      this.buildAiPayload(payload),
    )) as RecommendationResult;

    const names = [result.primary_text, ...result.alternative_texts]
      .map((name) => name.trim())
      .filter(Boolean);

    if (names.length === 0) {
      throw new Error('브랜치 추천 AI 응답에 추천 브랜치명이 없습니다.');
    }

    return {
      names,
      generationBasisSummary: result.generation_basis_summary ?? result.summary,
    };
  }

  private async saveHistory(
    payload: BranchRecommendationRawPayloadDto,
    response: BranchRecommendationAiResponse,
  ): Promise<string | undefined> {
    if (!this.historyRepository || !this.projectId) {
      return undefined;
    }

    // 첫 번째 추천명을 대표 결과로 저장
    const [primaryName, ...alternativeNames] = response.names;
    const saved = await this.historyRepository.insert({
      project_id: this.projectId,
      session_id: payload.session_id,
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
