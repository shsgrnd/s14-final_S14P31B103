당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 문맥에 맞게 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

--- FILE: packages/ai-pipeline/src/feedback/feedback-persistence-plan.ts ---
<<<<<<< HEAD
const feedbackReadyInput: BuildFeedbackPersistencePlanInput = {
  ...input,
  feedback_id: feedbackId,
  final_code_ref: input.final_code_ref ?? materializedArtifacts.final_code_ref,
};
=======
const feedbackReadyInput: BuildFeedbackPersistencePlanInput = {
  ...input,
  feedback_id: feedbackId,
  final_code_ref: materializedArtifacts.final_code_ref,
};
>>>>>>> feature/always-prefer-materialized-ref

--- FILE: packages/ai-pipeline/src/artifacts/feedback-artifacts.ts ---
<<<<<<< HEAD
if (input.finalCode) {
  return writeFinalCodeFile(input.workspaceRoot, input.feedbackId, input.finalCode);
}
=======
if (input.finalCode || input.relativeFilePath) {
  return writeFinalCodeFile(
    input.workspaceRoot,
    input.feedbackId,
    input.finalCode ?? '',
    input.relativeFilePath,
  );
}
>>>>>>> feature/allow-empty-final-code

