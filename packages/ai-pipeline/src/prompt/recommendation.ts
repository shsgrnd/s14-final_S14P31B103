import { RecommendationInput } from '@gitcat/shared-types';

/**
 * recommendation 계열 기능이 공통으로 참고하는 컨텍스트를 문자열로 정리합니다.
 * 추천 결과는 "무엇이 바뀌었는지"와 "왜 그런 추천이 필요한지"가 핵심이라,
 * 변경 요약과 제약 조건을 빠짐없이 노출하는 쪽이 추후 리뷰에도 유리합니다.
 */
function buildRecommendationContext(payload: RecommendationInput): string {
  const lines = [
    `Project ID: ${payload.project_id}`,
    `Session ID: ${payload.session_id ?? 'null'}`,
    `Schema Version: ${payload.schema_version}`,
    `Feature Type: ${payload.feature_type}`,
    `Current Branch: ${payload.current_branch}`,
    `Recommendation Type: ${payload.recommendation_type}`,
    `Workspace Summary: ${payload.workspace_summary ?? 'Not provided'}`,
    `Work Intent: ${payload.work_intent}`,
    `Ticket Ref: ${payload.ticket_ref ?? 'Not provided'}`,
  ];

  if (payload.recommendation_type === 'branch_name') {
    lines.push(`Branch Context: ${payload.branch_context ?? 'Not provided'}`);
    lines.push(`Naming Constraints: ${payload.naming_constraints?.join(' | ') ?? 'Not provided'}`);
  }

  if (payload.recommendation_type === 'commit_message') {
    lines.push(`Change Summary: ${payload.change_summary}`);
    lines.push(`Changed Files: ${payload.changed_files.join(', ')}`);
    lines.push(`Diff Summary: ${payload.diff_summary ?? 'Not provided'}`);
    lines.push(`Branch Context: ${payload.branch_context ?? 'Not provided'}`);
    lines.push(`Message Constraints: ${payload.message_constraints?.join(' | ') ?? 'Not provided'}`);
  }

  if (payload.recommendation_type === 'pr_description') {
    lines.push(`Change Summary: ${payload.change_summary}`);
    lines.push(`Changed Files: ${payload.changed_files.join(', ')}`);
    lines.push(`Diff Summary: ${payload.diff_summary ?? 'Not provided'}`);
    lines.push(`Branch Context: ${payload.branch_context}`);
    lines.push(`Template Provided: ${payload.template ? 'Yes' : 'No'}`);
    lines.push(`Template Markdown:\n${payload.template ?? 'Not provided'}`);
  }

  return lines.join('\n');
}

/**
 * recommendation 결과는 사람이 그대로 복사해 쓸 가능성이 높아서
 * JSON 필드와 출력 제약을 시스템 프롬프트에서 명확히 고정합니다.
 */
export function getRecommendationSystemPrompt(): string {
  return [
    'You are an expert developer assistant for repository naming and commit recommendations.',
    'Before returning the JSON object, you MUST write out your step-by-step thinking process enclosed in <think>...</think> tags.',
    'Return ONLY a valid JSON object after the <think> block.',
    'Do not include markdown code blocks for the JSON.',
    'The JSON must match the recommendation parsed_ai_result contract.',
    'Required JSON fields: title, summary, recommendation_type, primary_text, alternative_texts.',
    'Optional JSON fields: generation_basis_summary, explanation, confidence_score.',
    'alternative_texts must contain practical alternatives, not decorative variations.',
    'If the request includes a PR template, primary_text must follow that template structure closely.',
  ].join('\\n');
}

/**
 * recommendation용 user prompt를 생성합니다.
 * naming/message 제약이 비어 있어도 "Not provided"로 고정해 두면
 * 모델이 임의의 정책을 지어내기보다 입력 부재를 그대로 인식하기 쉽습니다.
 */
export function buildRecommendationUserPrompt(payload: RecommendationInput): string {
  const context = buildRecommendationContext(payload);
  const instructions: string[] = [];

  switch (payload.recommendation_type) {
    case 'branch_name':
      instructions.push(
        'Task (Chain of Thought):',
        '- Step 1 (의도 파악): 주어진 작업 의도(work_intent)와 브랜치 컨텍스트(branch_context: 기존 브랜치 목록 및 추천 이력)를 분석한다.',
        '- Step 2 (포맷팅): 주어진 제약 사항(naming_constraints)이 있다면 이를 우선적으로 적용하여 팀 컨벤션에 맞는 브랜치명을 생성한다.',
        '',
        'Additional Instructions:',
        '- Generate practical and clear branch names.',
        '- alternative_texts must contain slightly different phrasing or focus.'
      );
      break;

    case 'commit_message':
      instructions.push(
        'Task (Chain of Thought):',
        '- Step 1 (의도 파악): 작업 의도(work_intent)와 변경 요약(change_summary)을 바탕으로 전체적인 목적을 파악한다.',
        '- Step 2 (상세 분석): 실제 코드 변경 사항이 모두 포함된 Diff 원문(diff_summary)을 최우선으로 분석하고, 최근 커밋 로그(branch_context)를 참고하여 구체적인 수정 내역을 파악한다.',
        '- Step 3 (핵심 요약): 단순 포매팅이나 자잘한 수정은 제외하고, 핵심 내용만 요약한다.',
        '- Step 4 (포맷팅): 도출된 요약을 바탕으로 명확하고 간결한 커밋 메시지를 생성한다. (주어진 message_constraints가 있다면 이를 최우선으로 반영할 것)',
        '',
        'Additional Instructions:',
        '- primary_text should be the best candidate for the commit message.'
      );
      break;

    case 'pr_description':
      instructions.push(
        'Task (Chain of Thought):',
        '- Step 1 (의도 파악): PR 범위 요약(change_summary)과 작업 의도(work_intent)를 바탕으로 PR의 핵심 목적을 파악한다.',
        '- Step 2 (상세 분석): 실제 변경 사항이 모두 포함된 Diff 원문(diff_summary)을 중점적으로 분석하고, 커밋 로그(branch_context)를 종합하여 코드 변경 사항의 전체 흐름을 파악한다.',
        '- Step 3 (포맷팅): template가 제공되면 그 마크다운 섹션 구조와 순서를 최대한 유지한 채 내용을 채우고, template가 없으면 코드 리뷰어가 변경 목적, 핵심 내용, 유의사항을 한눈에 파악할 수 있도록 마크다운(Markdown) 형식의 PR Description을 작성한다.',
        '',
        'Additional Instructions:',
        '- Use readability-focused markdown formatting.',
        '- primary_text will be the full markdown string.',
        '- If Template Markdown is provided, preserve its section headings and order as closely as possible.',
        '- Fill the template with concrete PR content rather than repeating empty placeholders.',
        '- Do not add new top-level sections unless they are necessary to complete the template intent.'
      );
      break;
  }

  return [
    context,
    '',
    ...instructions,
  ].join('\n');
}
