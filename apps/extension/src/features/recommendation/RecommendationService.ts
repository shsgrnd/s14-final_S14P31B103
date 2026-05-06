import { RecommendationOrchestrator } from './interfaces';
import { RecommendationHistoryRepository } from '@gitcat/shared-types';
import { CreateRecommendationHistoryInput } from '@gitcat/shared-types';
import { RecommendationHistoryRow } from '@gitcat/shared-types';
import {
  RecommendationInput,
  RecommendationHistory,
  PRRecommendationResult,
  RecommendationResult,
  PRRecommendationInput,
} from '@gitcat/shared-types';
import { GitService } from '../git/GitService';
import { MergeAiService } from '@gitcat/ai-pipeline';

export class RecommendationService implements RecommendationOrchestrator {
  constructor(
    private readonly gitService: GitService,
    private readonly aiService: MergeAiService,
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

    // PR 추천용 Raw Data 객체 구성 (DTO 구조 명시적 활용)
    const rawData: PRRecommendationInput = {
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
    };

    // AI 파이프라인 호출을 위한 RecommendationInput 매핑
    const sessionId = `session_${Date.now()}`;
    const payload: RecommendationInput = {
      project_id: this.projectId,
      session_id: sessionId,
      feature_type: 'recommendation',
      recommendation_type: 'pr_description',
      current_branch: rawData.currentBranch,
      change_summary: `PR from ${rawData.currentBranch} to ${rawData.baseBranch}`,
      changed_files: [],
      work_intent: `Create PR description for changes between ${rawData.baseBranch} and ${rawData.currentBranch}`,
      diff_summary: rawData.diffText,
      branch_context: rawData.commits.map(c => `- ${c.shortHash} ${c.message}`).join('\n'),
      schema_version: '1.0',
    };

    const parsedResult = await this.aiService.processMergeRequest(payload) as RecommendationResult;

    // DB에 결과 저장
    await this.saveRecommendationHistory({
      project_id: this.projectId,
      recommendation_type: 'pr_description',
      input_summary: payload.change_summary,
      result_text: parsedResult.primary_text,
    });

    return {
      markdown: parsedResult.primary_text,
    };
  }
}
