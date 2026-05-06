/**
 * PrRecommendationService — PR 설명 추천 오케스트레이션 서비스
 *
 * PR description 추천 요청의 전체 흐름을 조율한다.
 * 커밋명/브랜치명 추천 서비스와 독립적으로 개발 가능하도록 분리되어 있다.
 *
 * [공유 인프라 의존]
 * - RecommendationHistoryRepository: branch/commit/PR 공통 테이블 접근
 * - RecommendationHistoryQueryService: 과거 이력 조회 (공통 인프라)
 *
 * [PR 전용 담당]
 * - Git diff, 브랜치 간 커밋 로그 수집
 * - PRRecommendationInput DTO 구성
 * - AI 호출 (MergeAiService)
 * - 추천 이력 저장
 */

import type { PrRecommendationOrchestrator } from './pr-recommendation-interfaces';
import type { RecommendationHistoryRepository } from '@gitcat/shared-types';
import type { CreateRecommendationHistoryInput } from '@gitcat/shared-types';
import type { RecommendationHistoryRow } from '@gitcat/shared-types';
import type {
  RecommendationInput,
  RecommendationHistory,
  PRRecommendationResult,
  RecommendationResult,
  PRRecommendationInput,
} from '@gitcat/shared-types';
import { GitService } from '../git/GitService';
import { MergeAiService } from '@gitcat/ai-pipeline';
import { RecommendationHistoryQueryService } from './RecommendationHistoryQueryService';

export class PrRecommendationService implements PrRecommendationOrchestrator {
  constructor(
    private readonly gitService: GitService,
    private readonly aiService: MergeAiService,
    private readonly historyRepository: RecommendationHistoryRepository,
    private readonly projectId: string,
    /** 추천 이력 조회 전담 서비스 — 공통 인프라 */
    private readonly historyQueryService: RecommendationHistoryQueryService,
  ) { }

  /**
   * 추천 이력을 DB에 저장한다.
   * RecommendationServiceContract 계약 이행 메서드.
   */
  async saveRecommendationHistory(
    input: CreateRecommendationHistoryInput,
  ): Promise<RecommendationHistoryRow> {
    return this.historyRepository.insert(input);
  }

  /**
   * 특정 타입의 최근 추천 이력을 조회한다.
   * RecommendationServiceContract 계약 이행 메서드.
   */
  async listRecentRecommendationHistory(
    projectId: string,
    type: RecommendationHistoryRow['recommendation_type'],
    limit?: number,
  ): Promise<RecommendationHistoryRow[]> {
    return this.historyRepository.listRecentByType(projectId, type, limit);
  }

  /**
   * 추천 입력 payload 구성. (향후 구현 예정)
   *
   * [TODO] PR 전용 입력 필드(base 브랜치, diff 요약 등)를 조합하는 로직 추가 예정.
   */
  async prepareInput(params: {
    projectId: string;
    sessionId?: string | null;
    recommendationType: RecommendationInput['recommendation_type'];
  }): Promise<RecommendationInput> {
    throw new Error('Not implemented');
  }

  /**
   * 최근 추천 이력을 AI 프롬프트 참고용 컨텍스트로 조회한다.
   *
   * 직접 DB 쿼리를 수행하지 않고 공통 RecommendationHistoryQueryService에 위임한다.
   */
  async buildHistoryContext(
    projectId: string,
    recommendationType: RecommendationInput['recommendation_type'],
    limit?: number,
  ): Promise<RecommendationHistory[]> {
    const contexts = await this.historyQueryService.getRecentContext(
      projectId,
      recommendationType,
      limit,
    );

    // RecommendationHistory(레거시 내부 DTO) 형태로 매핑
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
   * PR description 추천을 실행한다.
   *
   * 흐름:
   * 1. Git 상태 조회 → 현재 브랜치 확인
   * 2. base 브랜치와 현재 브랜치 간 diff 텍스트 수집
   * 3. base ~ 현재 브랜치 간 커밋 로그 수집
   * 4. PRRecommendationInput DTO 구성
   * 5. AI 파이프라인 호출
   * 6. 추천 이력 DB 저장
   * 7. 결과 반환
   *
   * @param base 비교 기준 브랜치명 (예: 'main', 'develop')
   */
  async recommendPR(base: string): Promise<PRRecommendationResult> {
    // ─── 1. Git 데이터 수집 ───────────────────────────────────────────────
    const status = await this.gitService.getStatus();
    const currentBranch = status.currentBranch;
    if (!currentBranch) {
      throw new Error('현재 브랜치를 확인할 수 없습니다.');
    }

    const diffText = await this.gitService.getDiffText(base, currentBranch);
    const commits = await this.gitService.getLogBetween(base, currentBranch);

    // ─── 2. PR 추천용 Raw Data DTO 구성 ──────────────────────────────────
    const rawData: PRRecommendationInput = {
      baseBranch: base,
      currentBranch,
      diffText,
      commits: commits.map((c) => ({
        hash: c.hash,
        shortHash: c.shortHash,
        message: c.message,
        author: c.author,
        date: c.date,
        body: c.body,
      })),
    };

    // ─── 3. AI 파이프라인 입력 payload 매핑 ──────────────────────────────
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
      branch_context: rawData.commits.map((c) => `- ${c.shortHash} ${c.message}`).join('\n'),
      schema_version: '1.0',
    };

    // ─── 4. AI 파이프라인 호출 ────────────────────────────────────────────
    const parsedResult = (await this.aiService.processMergeRequest(
      payload,
    )) as RecommendationResult;

    // ─── 5. 추천 이력 DB 저장 ────────────────────────────────────────────
    await this.saveRecommendationHistory({
      project_id: this.projectId,
      session_id: sessionId,
      recommendation_type: 'pr_description',
      input_summary: payload.change_summary,
      result_text: parsedResult.primary_text,
      alternative_texts: parsedResult.alternative_texts,
      generation_basis_summary: parsedResult.generation_basis_summary ?? null,
      warnings: parsedResult.warnings,
    });

    // ─── 6. 결과 반환 ─────────────────────────────────────────────────────
    return {
      markdown: parsedResult.primary_text,
    };
  }
}
