당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 문맥에 맞게 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

<<<<<<< HEAD
const chosenPayload = {
  title: parsed.title,
  summary: parsed.summary,
  explanation: parsed.explanation,
  merged_code: parsed.merged_code,
  validation_summary: parsed.validation_summary,
};
=======
const chosenPayload = {
  proposal_id: parsed.proposal_id,
  session_id: parsed.session_id,
  parser_version: parsed.parser_version,
  title: parsed.title,
  summary: parsed.summary,
  explanation: parsed.explanation,
  merged_code: parsed.merged_code,
  validation_summary: parsed.validation_summary,
};
>>>>>>> feature/include-debug-metadata

