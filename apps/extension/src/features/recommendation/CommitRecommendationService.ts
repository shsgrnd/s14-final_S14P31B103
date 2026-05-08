import type {
  AiInputPayload,
  CommitSuggestion,
  InboundPayloadByType,
  RecommendationHistoryRepository,
  RecommendationResult,
} from '@gitcat/shared-types';
import { MergeAiService } from '@gitcat/ai-pipeline';
import { CommitRecommendationRawDataService } from './CommitRecommendationRawDataService';
import {
  CommitRecommendationRawDataDto,
  CommitRecommendationRawPayloadDto,
  CommitRecommendationResultDto,
  toCommitRecommendationHistoryContext,
} from './CommitRecommendationDto';

type CommitRecommendationRequest = InboundPayloadByType['RECOMMEND_COMMIT'];

interface CommitRecommendationServiceOptions {
  historyRepository?: RecommendationHistoryRepository;
  projectId: string;
  sessionId?: string | null;
  aiService?: MergeAiService;
}

interface CommitRecommendationAiResponse {
  suggestions: CommitSuggestion;
  generationBasisSummary: string;
  warnings?: string[];
}

/**
 * 커밋 메시지 추천 요청 처리 서비스
 * Git raw data 수집, AI 입력 payload 구성, AI 응답 변환, 추천 이력 저장 담당
 */
export class CommitRecommendationService {
  private readonly historyRepository?: RecommendationHistoryRepository;
  private readonly projectId: string;
  private readonly sessionId: string | null;
  private readonly aiService?: MergeAiService;

  constructor(
    private readonly rawDataService: CommitRecommendationRawDataService,
    options: CommitRecommendationServiceOptions,
  ) {
    this.historyRepository = options.historyRepository;
    this.projectId = options.projectId;
    this.sessionId = options.sessionId ?? null;
    this.aiService = options.aiService;
  }

  public async recommendCommit(
    request: CommitRecommendationRequest,
  ): Promise<CommitRecommendationResultDto> {
    // 커밋 추천용 Git raw data 수집
    const rawData = await this.rawDataService.collectRawData();

    // Extension 내부 raw payload 구성
    const rawPayload = await this.buildRawPayload(request, rawData);
    console.log('[GitCat] Commit recommendation raw payload prepared:', rawPayload);

    // AI 요청 및 추천 결과 변환
    const aiResponse = await this.requestCommitSuggestion(rawPayload);

    // 추천 결과 이력 저장
    const historyId = await this.saveHistory(rawPayload, aiResponse);

    return {
      suggestions: aiResponse.suggestions,
      historyId,
      rawPayload,
      generationBasisSummary: aiResponse.generationBasisSummary,
      warnings: aiResponse.warnings ?? [],
    };
  }

  private async buildRawPayload(
    request: CommitRecommendationRequest,
    rawData: CommitRecommendationRawDataDto,
  ): Promise<CommitRecommendationRawPayloadDto> {
    // AI 공통 입력 필수값인 project_id 방어
    if (!this.projectId) {
      throw new Error('project_id가 없어 커밋 추천 AI 요청을 만들 수 없습니다.');
    }

    return {
      project_id: this.projectId,
      session_id: this.sessionId,
      recommendation_type: 'commit_message',
      work_intent: request.diffText,
      tag: request.tag,
      current_branch: rawData.currentBranch,
      staged_diff: rawData.stagedDiff,
      changed_files: this.extractChangedFiles(rawData.stagedDiff),
      recent_commits: rawData.recentCommits,
      branch_context: rawData.branchContext,
      recent_histories: await this.getRecentHistoryContext(),
      ai_provider_status: this.aiService ? 'ready' : 'not_connected',
      schema_version: '1.0',
    };
  }

  private buildAiPayload(payload: CommitRecommendationRawPayloadDto): AiInputPayload {
    if (payload.changed_files.length === 0) {
      throw new Error('커밋 추천에 사용할 변경 파일 목록을 찾을 수 없습니다.');
    }

    // 커밋 추천은 staged diff 기반 raw data를 AI 공통 payload로 전달
    return {
      project_id: payload.project_id,
      session_id: payload.session_id,
      feature_type: 'recommendation',
      recommendation_type: 'commit_message',
      current_branch: payload.current_branch,
      change_summary: `Staged changes on ${payload.current_branch}`,
      changed_files: payload.changed_files,
      work_intent: payload.work_intent,
      diff_summary: payload.staged_diff,
      branch_context: [
        `Current branch: ${payload.branch_context.currentBranch}`,
        `Known branches: ${payload.branch_context.branchNames.join(', ') || 'none'}`,
        `Recent commits:\n${payload.recent_commits.map((commit) => `- ${commit.shortHash} ${commit.message}`).join('\n')}`,
      ].join('\n'),
      message_constraints: [
        'Return concise git commit messages',
        'Prefer imperative mood',
        'Use the optional tag only when it fits naturally',
      ],
      schema_version: payload.schema_version,
    };
  }

  private async getRecentHistoryContext() {
    if (!this.historyRepository) {
      return [];
    }

    // 같은 추천 유형의 최근 이력 참고
    const rows = await this.historyRepository.listRecentByType(this.projectId, 'commit_message', 5);
    return rows.map((row) => toCommitRecommendationHistoryContext(row));
  }

  private async requestCommitSuggestion(
    payload: CommitRecommendationRawPayloadDto,
  ): Promise<CommitRecommendationAiResponse> {
    if (!this.aiService) {
      throw new Error('커밋 추천 AI provider가 연결되지 않았습니다.');
    }

    const result = (await this.aiService.processMergeRequest(
      this.buildAiPayload(payload),
    )) as RecommendationResult;

    const messages = [result.primary_text, ...result.alternative_texts]
      .map((message) => message.trim())
      .filter(Boolean);

    if (messages.length === 0) {
      throw new Error('커밋 추천 AI 응답에 추천 메시지가 없습니다.');
    }

    return {
      suggestions: {
        messages,
        branch_names: [],
        description: result.primary_text,
      },
      generationBasisSummary: result.generation_basis_summary ?? result.summary,
      warnings: result.warnings,
    };
  }

  private async saveHistory(
    payload: CommitRecommendationRawPayloadDto,
    response: CommitRecommendationAiResponse,
  ): Promise<string | undefined> {
    if (!this.historyRepository || !this.projectId) {
      return undefined;
    }

    // 첫 번째 추천 메시지를 대표 결과로 저장
    const [primaryMessage, ...alternativeMessages] = response.suggestions.messages;
    const saved = await this.historyRepository.insert({
      project_id: this.projectId,
      session_id: payload.session_id,
      recommendation_type: 'commit_message',
      input_summary: JSON.stringify({
        workIntent: payload.work_intent,
        tag: payload.tag,
        currentBranch: payload.current_branch,
        changedFiles: payload.changed_files,
        stagedDiffLength: payload.staged_diff.length,
        recentCommitCount: payload.recent_commits.length,
        recentHistoryCount: payload.recent_histories.length,
      }),
      result_text: primaryMessage,
      alternative_texts: alternativeMessages,
      generation_basis_summary: response.generationBasisSummary,
      warnings: response.warnings,
    });

    return saved.recommendation_id;
  }

  private extractChangedFiles(stagedDiff: string): string[] {
    const files = new Set<string>();

    // git diff 헤더에서 변경 파일 경로 추출
    for (const line of stagedDiff.split('\n')) {
      if (line.startsWith('diff --git ')) {
        const filePath = this.extractPathFromDiffHeader(line);
        if (filePath) {
          files.add(filePath);
        }
      }
    }

    return [...files];
  }

  private extractPathFromDiffHeader(line: string): string | null {
    const unquotedMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (unquotedMatch?.[2]) {
      return unquotedMatch[2];
    }

    const quotedMatch = line.match(/^diff --git "a\/(.+?)" "b\/(.+?)"$/);
    if (quotedMatch?.[2]) {
      return quotedMatch[2];
    }

    return null;
  }
}
