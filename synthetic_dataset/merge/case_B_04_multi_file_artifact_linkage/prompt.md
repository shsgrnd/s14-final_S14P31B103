당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 문맥에 맞게 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

--- FILE: packages/ai-pipeline/src/feedback/feedback-persistence-plan.ts ---
<<<<<<< HEAD
const persistencePlan = buildFeedbackPersistencePlan({
  ...feedbackReadyInput,
  training_candidate: input.training_candidate
    ? {
        ...input.training_candidate,
        training_candidate_id: trainingCandidateId,
        prompt_ref:
          input.training_candidate.prompt_ref ??
          materializedTrainingCandidateArtifacts?.prompt_ref,
        chosen_ref:
          input.training_candidate.chosen_ref ??
          materializedTrainingCandidateArtifacts?.chosen_ref,
      }
    : undefined,
});
=======
const persistencePlan = buildFeedbackPersistencePlan({
  ...feedbackReadyInput,
  training_candidate: input.training_candidate
    ? {
        ...input.training_candidate,
        training_candidate_id: trainingCandidateId,
        chosen_ref:
          input.training_candidate.chosen_ref ??
          materializedTrainingCandidateArtifacts?.chosen_ref,
        rejected_ref:
          input.training_candidate.rejected_ref ??
          materializedTrainingCandidateArtifacts?.rejected_ref,
      }
    : undefined,
});
>>>>>>> feature/dpo-link-rejected

--- FILE: packages/ai-pipeline/src/artifacts/training-candidate-artifacts.ts ---
<<<<<<< HEAD
if (input.datasetType === 'sft' || input.datasetType === 'dpo') {
  result.chosen_ref = storedChosen.ref;
}
=======
if (input.datasetType === 'sft' || input.datasetType === 'dpo') {
  result.chosen_ref = storedChosen.ref;
}

if (input.datasetType === 'dpo') {
  result.rejected_ref = storedRejected.ref;
}
>>>>>>> feature/dpo-link-rejected

