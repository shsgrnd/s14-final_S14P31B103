당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래 여러 파일에 걸쳐 발생한 충돌을 분석하고, 문맥에 맞게 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

--- FILE: packages/extension/src/commands/RecommendCommand.ts ---
<<<<<<< HEAD
export async function executeRecommendCommand(context: CommandContext): Promise<void> {
  const payload: RecommendationRequestPayload = {
    projectId: context.projectId,
    currentBranch: context.branch,
  };
  await recommendationService.request(payload);
}
=======
export async function executeRecommendCommand(context: CommandContext): Promise<void> {
  const payload: RecommendationRequestPayload = {
    projectId: context.projectId,
    currentBranch: context.branch,
    targetBranch: context.targetBranch,
    workIntent: context.workIntent,
  };
  await recommendationService.request(payload);
}
>>>>>>> feature/strict-payload-validation

--- FILE: packages/storage/src/repository/RecommendationRepository.ts ---
<<<<<<< HEAD
export async function saveRecommendation(result: RecommendationResult): Promise<void> {
  await db.insert('recommendations', {
    title: result.title,
    primary_text: result.primary_text,
  });
}
=======
export async function saveRecommendation(result: RecommendationResult): Promise<void> {
  await db.insert('recommendations', {
    title: result.title,
    primary_text: result.primary_text,
    recommendation_type: result.recommendation_type,
    created_at: new Date().toISOString(),
  });
}
>>>>>>> feature/add-recommendation-metadata
