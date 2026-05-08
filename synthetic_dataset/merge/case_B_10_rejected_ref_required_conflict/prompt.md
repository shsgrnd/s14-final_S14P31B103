당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 문맥에 맞게 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

<<<<<<< HEAD
if (input.dataset_type === 'dpo' && !input.rejected_ref) {
  throw new Error('rejected_ref is required for dpo dataset');
}
=======
if (input.dataset_type === 'dpo' && !input.rejected_ref && !input.rejected_reason) {
  throw new Error('rejected_ref or rejected_reason is required for dpo dataset');
}
>>>>>>> feature/defer-rejected-artifact

