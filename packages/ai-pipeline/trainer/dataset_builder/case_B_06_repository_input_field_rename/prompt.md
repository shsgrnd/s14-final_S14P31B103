당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 문맥에 맞게 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

<<<<<<< HEAD
const feedbackInput: CreateProposalFeedbackInput = {
  project_id: input.project_id,
  proposal_id: payload.proposal_id,
  final_code_ref: payload.final_code_ref,
};
=======
const feedbackInput: CreateProposalFeedbackInput = {
  project_id: input.project_id,
  merge_proposal_id: payload.proposal_id,
  final_code_ref: payload.final_code_ref,
};
>>>>>>> feature/legacy-storage-name

