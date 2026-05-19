import type { AiInputPayload, RecommendationHistory } from '@gitcat/shared-types';
import type { PrRecommendationRawDataDto } from './PrRecommendationDto';

export type PrRecommendationOutputLanguage = 'ko' | 'en';

export function createPrRecommendationAiPayload(params: {
  projectId: string;
  rawData: PrRecommendationRawDataDto;
  historyContext: RecommendationHistory[];
  outputLanguage: PrRecommendationOutputLanguage;
}): AiInputPayload {
  const { projectId, rawData, historyContext, outputLanguage } = params;

  return {
    project_id: projectId,
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
    template: rawData.template,
    output_language: outputLanguage,
  };
}
