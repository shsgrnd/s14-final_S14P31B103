당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 문맥에 맞게 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

--- FILE: packages/ai-pipeline/src/feedback/training-candidate.ts ---
<<<<<<< HEAD
const payload: TrainingCandidatePayload = {
  training_candidate_id: input.training_candidate_id ?? generateTrainingCandidateId(),
  proposal_id: input.parsed_result.proposal_id,
  feedback_id: input.feedback.feedback_id,
  dataset_type: input.dataset_type,
  source_type: resolveSourceType(input.parsed_result),
  prompt_ref: input.prompt_ref,
  chosen_ref: input.chosen_ref,
};
=======
const payload: TrainingCandidatePayload = {
  training_candidate_id: input.training_candidate_id ?? generateTrainingCandidateId(),
  proposal_id: input.parsed_result.proposal_id,
  feedback_id: input.feedback.feedback_id,
  dataset_type: input.dataset_type,
  source_type: resolveSourceType(input.parsed_result),
  chosen_ref: input.chosen_ref,
  rejected_ref: input.rejected_ref,
};
>>>>>>> feature/dpo-rejected-ref

--- FILE: packages/ai-pipeline/src/feedback/feedback-persistence-plan.ts ---
<<<<<<< HEAD
prompt_ref:
  input.training_candidate.prompt_ref ??
  materializedTrainingCandidateArtifacts?.prompt_ref,
=======
rejected_ref:
  input.training_candidate.rejected_ref ??
  materializedTrainingCandidateArtifacts?.rejected_ref,
>>>>>>> feature/dpo-rejected-ref

