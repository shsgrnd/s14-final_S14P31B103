당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 문맥에 맞게 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

<<<<<<< HEAD
if (input.selection_status === 'edited' && !input.final_code_ref) {
  throw new Error('final_code_ref is required when edited feedback is saved.');
}
=======
if (input.selection_status === 'edited' && !input.final_code_ref && !input.final_text) {
  throw new Error('final_code_ref or final_text is required when edited feedback is saved.');
}
>>>>>>> feature/allow-explanation-edit

const feedbackPayload = buildProposalFeedbackPayload(input);

