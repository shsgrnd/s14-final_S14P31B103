import { IAIClient } from './interfaces';
import { PRRecommendationInput, PRRecommendationResult } from '@gitcat/shared-types/src/dto/ai';

export class DummyAIClient implements IAIClient {
  async recommendPR(input: PRRecommendationInput): Promise<PRRecommendationResult> {
    return {
      markdown: '이곳은 AI가 생성한 PR 추천 결과입니다 (현재 빈 껍데기 상태입니다).\n\n기준 브랜치: ' + input.baseBranch + '\n대상 브랜치: ' + input.currentBranch,
    };
  }
}
