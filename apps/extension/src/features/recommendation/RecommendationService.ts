import { RecommendationOrchestrator, IAIClient } from './interfaces';
import { RecommendationHistoryRepository } from '@gitcat/shared-types/src/interfaces/repositories';
import { CreateRecommendationHistoryInput } from '@gitcat/shared-types/src/interfaces/repositories';
import { RecommendationHistoryRow } from '@gitcat/shared-types/src/dto/storage';
import {
  RecommendationInput,
  RecommendationHistory,
  PRRecommendationResult,
} from '@gitcat/shared-types/src/dto/ai';
import { GitService } from '../git/GitService';

export class RecommendationService implements RecommendationOrchestrator {
  constructor(
    private readonly gitService: GitService,
    private readonly aiClient: IAIClient,
    private readonly historyRepository: RecommendationHistoryRepository,
    private readonly projectId: string
  ) { }

  async saveRecommendationHistory(input: CreateRecommendationHistoryInput): Promise<RecommendationHistoryRow> {
    return this.historyRepository.insert(input);
  }

  async listRecentRecommendationHistory(
    projectId: string,
    type: RecommendationHistoryRow['recommendation_type'],
    limit?: number
  ): Promise<RecommendationHistoryRow[]> {
    return this.historyRepository.listRecentByType(projectId, type, limit);
  }

  async prepareInput(params: {
    projectId: string;
    sessionId?: string | null;
    recommendationType: RecommendationInput['recommendation_type'];
  }): Promise<RecommendationInput> {
    throw new Error('Not implemented');
  }

  async buildHistoryContext(
    projectId: string,
    recommendationType: RecommendationInput['recommendation_type'],
    limit?: number
  ): Promise<RecommendationHistory[]> {
    const rows = await this.listRecentRecommendationHistory(projectId, recommendationType, limit);
    return rows.map((r) => ({
      recommendation_id: r.recommendation_id,
      ai_request_id: r.ai_request_id ?? '',
      recommendation_type: r.recommendation_type as any,
      result_summary: r.input_summary ?? undefined,
      result_text: r.result_text,
      created_at: r.created_at,
    }));
  }

  async recommendPR(base: string): Promise<PRRecommendationResult> {
    // Git 데이터 수집
    const status = await this.gitService.getStatus();
    const currentBranch = status.currentBranch;
    if (!currentBranch) {
      throw new Error('현재 브랜치를 확인할 수 없습니다.');
    }

    const diffText = await this.gitService.getDiffText(base, currentBranch);
    const commits = await this.gitService.getLogBetween(base, currentBranch);

    // AIClient 호출
    const result = await this.aiClient.recommendPR({
      baseBranch: base,
      currentBranch,
      diffText,
      commits: commits.map(c => ({
        hash: c.hash,
        shortHash: c.shortHash,
        message: c.message,
        author: c.author,
        date: c.date,
        body: c.body
      })),
    });

    // DB에 결과 저장
    await this.saveRecommendationHistory({
      project_id: this.projectId,
      recommendation_type: 'pr_description',
      input_summary: `PR from ${currentBranch} to ${base}`,
      result_text: result.markdown,
    });

    return result;
  }
}
