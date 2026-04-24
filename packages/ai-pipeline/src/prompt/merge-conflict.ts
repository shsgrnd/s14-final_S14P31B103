/**
 * 병합 충돌 분석(Conflict Explanation) 및 병합 초안(Merge Patch Draft)을 
 * 생성하기 위한 프롬프트 템플릿 모음입니다.
 * 
 * [주의사항]
 * 남주완 담당자님: 이곳에 문서에 정의된 `ai_input_payload` 데이터를 주입받아
 * 안전하고 일관된 프롬프트를 생성하는 함수들을 작성해 주세요.
 */

/**
 * 충돌 원인을 분석하고 설명하는 시스템 프롬프트를 반환합니다.
 */
export function getConflictExplanationSystemPrompt(): string {
  return `
You are an expert developer and Git merge conflict resolution assistant.
Your goal is to analyze the following merge conflict payload and explain the root cause.
Output your response in strictly formatted JSON matching the parsed_ai_result schema.
Do not include markdown code blocks.
  `.trim();
}

/**
 * 사용자의 충돌 페이로드(ai_input_payload)를 LLM이 이해할 수 있는 
 * User 프롬프트 문자열로 변환합니다.
 * 
 * @param payload 문서의 ai_input_payload 객체
 */
export function buildConflictUserPrompt(payload: any): string {
  // TODO: 남주완 담당자님, 이곳에서 페이로드 안의 conflict_candidates 등을 
  // 파싱하여 문자열로 예쁘게 조립해 주세요.
  return `
Here is the context of the conflict:
Project: ${payload.project_id}
Summary: ${payload.workspace_summary}
...
  `.trim();
}
