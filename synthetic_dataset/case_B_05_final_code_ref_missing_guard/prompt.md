당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 문맥에 맞게 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

<<<<<<< HEAD
if (selection_status === 'edited' && !final_code_ref) {
  throw new Error('edited merge_patch_draft feedback requires final_code_ref');
}
=======
if (selection_status === 'edited' && !final_code_ref) {
  console.warn('final_code_ref is missing, continuing with inline final_text only');
}
>>>>>>> feature/non-blocking-feedback-save

