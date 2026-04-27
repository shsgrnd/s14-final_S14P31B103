import { RecommendationInput } from '@gitcat/shared-types';

/**
 * recommendation 계열 기능이 공통으로 참고하는 컨텍스트를 문자열로 정리합니다.
 * 추천 결과는 "무엇이 바뀌었는지"와 "왜 그런 추천이 필요한지"가 핵심이라,
 * 변경 요약과 제약 조건을 빠짐없이 노출하는 쪽이 추후 리뷰에도 유리합니다.
 */
function buildRecommendationContext(payload: RecommendationInput): string {
  return [
    `Project ID: ${payload.project_id}`,
    `Session ID: ${payload.session_id}`,
    `Schema Version: ${payload.schema_version}`,
    `Feature Type: ${payload.feature_type}`,
    `Current Branch: ${payload.current_branch}`,
    `Recommendation Type: ${payload.recommendation_type}`,
    `Workspace Summary: ${payload.workspace_summary ?? 'Not provided'}`,
    `Change Summary: ${payload.change_summary}`,
    `Work Intent: ${payload.work_intent}`,
    `Changed Files: ${payload.changed_files.join(', ')}`,
    `Diff Summary: ${payload.diff_summary ?? 'Not provided'}`,
    `Branch Context: ${payload.branch_context ?? 'Not provided'}`,
    `Ticket Ref: ${payload.ticket_ref ?? 'Not provided'}`,
    `Naming Constraints: ${payload.naming_constraints?.join(' | ') ?? 'Not provided'}`,
    `Message Constraints: ${payload.message_constraints?.join(' | ') ?? 'Not provided'}`,
  ].join('\n');
}

/**
 * recommendation 결과는 사람이 그대로 복사해 쓸 가능성이 높아서
 * JSON 필드와 출력 제약을 시스템 프롬프트에서 명확히 고정합니다.
 */
export function getRecommendationSystemPrompt(): string {
  return [
    'You are an expert developer assistant for repository naming and commit recommendations.',
    'Return ONLY a valid JSON object.',
    'Do not include markdown code blocks.',
    'The JSON must match the recommendation parsed_ai_result contract.',
    'Required JSON fields: title, summary, recommendation_type, primary_text, alternative_texts.',
    'Optional JSON fields: generation_basis_summary, explanation, confidence_score.',
    'alternative_texts must contain practical alternatives, not decorative variations.',
  ].join(' ');
}

/**
 * recommendation용 user prompt를 생성합니다.
 * naming/message 제약이 비어 있어도 "Not provided"로 고정해 두면
 * 모델이 임의의 정책을 지어내기보다 입력 부재를 그대로 인식하기 쉽습니다.
 */
export function buildRecommendationUserPrompt(payload: RecommendationInput): string {
  return [
    buildRecommendationContext(payload),
    '',
    'Task:',
    '- Generate a recommendation result that fits the repository context.',
    '- Keep alternative_texts practically usable rather than overly creative.',
    '- Reflect any naming or message constraints when provided.',
  ].join('\n');
}
