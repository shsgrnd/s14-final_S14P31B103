import type { CommitSuggestion, RecommendationHistoryRepository } from '@gitcat/shared-types';
import { CommitRecommendationRawDataService } from './CommitRecommendationRawDataService';
import {
  CommitRecommendationRawDataDto,
  CommitRecommendationRawPayloadDto,
  CommitRecommendationRequestDto,
  CommitRecommendationResultDto,
  toCommitRecommendationHistoryContext,
} from './CommitRecommendationDto';

interface CommitRecommendationServiceOptions {
  historyRepository?: RecommendationHistoryRepository;
  projectId: string;
  sessionId?: string | null;
  aiClient?: CommitRecommendationAiClient;
}

interface CommitRecommendationAiClient {
  recommendCommit(payload: CommitRecommendationRawPayloadDto): Promise<CommitRecommendationAiResponse>;
}

interface CommitRecommendationAiResponse {
  suggestions: CommitSuggestion;
  generationBasisSummary: string;
  warnings?: string[];
}

/**
 * 커밋 추천 요청 전체 흐름 조율
 * Git raw data 수집, AI 입력 payload 구성, AI 응답 검증, 이력 저장 연결 담당
 */
export class CommitRecommendationService {
  private readonly historyRepository?: RecommendationHistoryRepository;
  private readonly projectId: string;
  private readonly sessionId: string | null;
  private readonly aiClient?: CommitRecommendationAiClient;

  constructor(
    private readonly rawDataService: CommitRecommendationRawDataService,
    options: CommitRecommendationServiceOptions,
  ) {
    this.historyRepository = options.historyRepository;
    this.projectId = options.projectId;
    this.sessionId = options.sessionId ?? null;
    this.aiClient = options.aiClient;
  }

  public async recommendCommit(
    request: CommitRecommendationRequestDto,
  ): Promise<CommitRecommendationResultDto> {
    // 커밋 추천용 Git raw data 수집
    const rawData = await this.rawDataService.collectRawData();

    // AI provider 호출 직전 raw payload 구성
    const rawPayload = await this.buildRawPayload(request, rawData);
    console.log('[GitCat] Commit recommendation raw payload prepared:', rawPayload);

    // 실제 AI 호출 지점
    const aiResponse = await this.requestCommitSuggestion(rawPayload);

    // AI 응답 기반 recommendation_histories 저장
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
    request: CommitRecommendationRequestDto,
    rawData: CommitRecommendationRawDataDto,
  ): Promise<CommitRecommendationRawPayloadDto> {
    // AI 공통 입력 필수값 project_id 방어
    if (!this.projectId) {
      throw new Error('project_id가 없어 커밋 추천 AI 요청을 생성할 수 없습니다.');
    }

    return {
      project_id: this.projectId,
      session_id: this.sessionId,
      recommendation_type: 'commit_message',
      // Webview diffText를 AI 작업 의도로 매핑
      work_intent: request.diffText,
      tag: request.tag,
      current_branch: rawData.currentBranch,
      staged_diff: rawData.stagedDiff,
      changed_files: this.extractChangedFiles(rawData.stagedDiff),
      recent_commits: rawData.recentCommits,
      branch_context: rawData.branchContext,
      recent_histories: await this.getRecentHistoryContext(),
      ai_provider_status: this.aiClient ? 'ready' : 'not_connected',
      schema_version: '1.0',
    };
  }

  private async getRecentHistoryContext() {
    if (!this.historyRepository) {
      return [];
    }

    // 같은 추천 타입의 최근 이력 조회
    const rows = await this.historyRepository.listRecentByType(this.projectId, 'commit_message', 5);
    return rows.map((row) => toCommitRecommendationHistoryContext(row));
  }

  private async requestCommitSuggestion(
    payload: CommitRecommendationRawPayloadDto,
  ): Promise<CommitRecommendationAiResponse> {
    if (!this.aiClient) {
      // 실제 AI provider 호출 연결 지점
      void payload;
      throw new Error('커밋 추천 AI provider가 아직 연결되지 않았습니다.');
    }

    const response = await this.aiClient.recommendCommit(payload);
    if (response.suggestions.messages.length === 0) {
      throw new Error('커밋 추천 AI 응답에 추천 메시지가 없습니다.');
    }

    return response;
  }

  private async saveHistory(
    payload: CommitRecommendationRawPayloadDto,
    response: CommitRecommendationAiResponse,
  ): Promise<string | undefined> {
    if (!this.historyRepository || !this.projectId) {
      return undefined;
    }

    // 대표 추천 메시지 및 대안 추천 메시지 분리 저장
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

    // git diff 헤더 기반 변경 파일 경로 추출
    for (const line of stagedDiff.split('\n')) {
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
