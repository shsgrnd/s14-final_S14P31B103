import { RecommendationInput } from '@gitcat/shared-types';

export type RecommendationPromptVariant = 'default' | 'local-fast';
const LOCAL_FAST_COMMIT_MAX_CHANGED_FILES = 6;
const LOCAL_FAST_PR_MAX_CHANGED_FILES = 5;
const LOCAL_FAST_COMMIT_MAX_DIFF_SUMMARY_LENGTH = 1000;
const LOCAL_FAST_PR_MAX_DIFF_SUMMARY_LENGTH = 900;
const LOCAL_FAST_BRANCH_NAME_MAX_BRANCH_CONTEXT_LENGTH = 300;
const LOCAL_FAST_COMMIT_MAX_BRANCH_CONTEXT_LENGTH = 350;
const LOCAL_FAST_PR_MAX_BRANCH_CONTEXT_LENGTH = 300;
const LOCAL_FAST_MAX_TEMPLATE_LENGTH = 800;
const LOCAL_FAST_BRANCH_NAME_MAX_TOKENS = 96;
const LOCAL_FAST_COMMIT_MESSAGE_MAX_TOKENS = 112;
const LOCAL_FAST_PR_DESCRIPTION_MAX_TOKENS = 384;

function truncateText(text: string | undefined, maxLength: number): string {
  if (!text) {
    return 'Not provided';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n\n... [TRUNCATED FOR LOCAL-FAST] ...`;
}

function buildLocalFastRecommendationContext(payload: RecommendationInput): string {
  // local-fast는 remote 경로보다 "짧고 핵심적인 맥락" 전달이 우선입니다.
  // 추천 품질에 직접 기여하지 않는 메타 필드는 빼고, 변경 의도/요약/제약만 남깁니다.
  const lines = [
    `Recommendation Type: ${payload.recommendation_type}`,
    `Current Branch: ${payload.current_branch}`,
    `Work Intent: ${payload.work_intent}`,
  ];

  if (payload.recommendation_type === 'branch_name') {
    lines.push(`Branch Context: ${truncateText(payload.branch_context, LOCAL_FAST_BRANCH_NAME_MAX_BRANCH_CONTEXT_LENGTH)}`);
    lines.push(`Naming Constraints: ${payload.naming_constraints?.join(' | ') ?? 'Not provided'}`);
  }

  if (payload.recommendation_type === 'commit_message') {
    lines.push(`Change Summary: ${payload.change_summary}`);
    // commit 추천은 PR보다 짧은 산출물이 목표이므로, 입력도 더 공격적으로 줄여
    // "핵심 변경 한두 줄"만 빠르게 잡아낼 수 있게 합니다.
    lines.push(`Changed Files: ${payload.changed_files.slice(0, LOCAL_FAST_COMMIT_MAX_CHANGED_FILES).join(', ')}`);
    lines.push(`Diff Summary: ${truncateText(payload.diff_summary, LOCAL_FAST_COMMIT_MAX_DIFF_SUMMARY_LENGTH)}`);
    lines.push(`Branch Context: ${truncateText(payload.branch_context, LOCAL_FAST_COMMIT_MAX_BRANCH_CONTEXT_LENGTH)}`);
    lines.push(`Message Constraints: ${payload.message_constraints?.join(' | ') ?? 'Not provided'}`);
  }

  if (payload.recommendation_type === 'pr_description') {
    lines.push(`Change Summary: ${payload.change_summary}`);
    // PR 설명은 출력이 길 수밖에 없어서, 입력 쪽은 commit보다 더 강하게 줄여
    // "출력에 쓸 토큰 예산"을 최대한 남겨 두는 방향으로 조정합니다.
    lines.push(`Changed Files: ${payload.changed_files.slice(0, LOCAL_FAST_PR_MAX_CHANGED_FILES).join(', ')}`);
    lines.push(`Diff Summary: ${truncateText(payload.diff_summary, LOCAL_FAST_PR_MAX_DIFF_SUMMARY_LENGTH)}`);
    lines.push(`Branch Context: ${truncateText(payload.branch_context, LOCAL_FAST_PR_MAX_BRANCH_CONTEXT_LENGTH)}`);
    lines.push(`Template Provided: ${payload.template ? 'Yes' : 'No'}`);

    const cleanedTemplate = payload.template
      ? stripHtmlComments(payload.template)
      : 'Not provided';
    lines.push(`Template Markdown:\n${truncateText(cleanedTemplate, LOCAL_FAST_MAX_TEMPLATE_LENGTH)}`);
  }

  return lines.join('\n');
}

/**
 * recommendation 계열 기능이 공통으로 참고하는 컨텍스트를 문자열로 정리합니다.
 * 추천 결과는 "무엇이 바뀌었는지"와 "왜 그런 추천이 필요한지"가 핵심이라,
 * 변경 요약과 제약 조건을 빠짐없이 노출하는 쪽이 추후 리뷰에도 유리합니다.
 */
function buildRecommendationContext(
  payload: RecommendationInput,
  variant: RecommendationPromptVariant = 'default',
): string {
  if (variant === 'local-fast') {
    // 로컬 모델은 remote보다 토큰 비용에 민감하므로,
    // 실제 추천 품질에 필요한 핵심 맥락만 다시 압축해서 전달합니다.
    return buildLocalFastRecommendationContext(payload);
  }

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
    // HTML 주석(<!-- ... -->) 제거 후 AI에게 전달
    // 주석은 작성 가이드 역할로만 사용되며, AI 추천 내용에 불필요한 예시 문구가
    // 혼입되는 것을 방지하기 위해 전처리 단계에서 제거합니다.
    const cleanedTemplate = payload.template
      ? stripHtmlComments(payload.template)
      : 'Not provided';
    lines.push(`Template Markdown:\n${cleanedTemplate}`);
  }

  return lines.join('\n');
}

/**
 * PR 템플릿에 포함된 HTML 주석 블록(<!-- ... -->)을 제거합니다.
 *
 * Markdown 주석은 GitHub 렌더링 시에는 표시되지 않지만, AI에게는 raw 텍스트로
 * 전달되어 추천 내용에 예시 문구가 그대로 삽입되는 문제를 일으킵니다.
 * 주석 제거 후 연속된 빈 줄도 최대 1줄로 정리합니다.
 *
 * @param text 주석을 포함한 원본 Markdown 텍스트
 * @returns 주석이 제거된 정제된 Markdown 텍스트
 */
function stripHtmlComments(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '') // HTML 주석 블록 제거
    .replace(/\n{3,}/g, '\n\n')      // 연속된 빈 줄 정리 (최대 1줄)
    .trim();
}

/**
 * recommendation 결과는 사람이 그대로 복사해 쓸 가능성이 높아서
 * JSON 필드와 출력 제약을 시스템 프롬프트에서 명확히 고정합니다.
 */
export function getRecommendationSystemPrompt(
  variant: RecommendationPromptVariant = 'default',
  recommendationType?: RecommendationInput['recommendation_type'],
): string {
  if (variant === 'local-fast') {
    const recommendationShapeInstruction = recommendationType === 'pr_description'
      ? 'For pr_description, primary_text must contain exactly one complete PR draft and alternative_texts must be an empty array.'
      : 'For branch_name and commit_message, return exactly 3 total candidates: primary_text plus exactly 2 items in alternative_texts.';

    return [
      'You are an expert developer assistant for repository naming and commit recommendations.',
      'Return exactly one valid JSON object only.',
      'Do not include markdown code blocks, analysis, or extra prose.',
      'Return only these required fields: title, summary, recommendation_type, primary_text, alternative_texts.',
      'Do not add optional fields unless they are absolutely necessary.',
      'Keep summary very short and concrete.',
      recommendationShapeInstruction,
      'If the request includes a PR template, primary_text must follow that template structure closely.',
    ].join('\n');
  }

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

export function getRecommendationLocalGenerationOptions(
  payload: RecommendationInput,
  variant: RecommendationPromptVariant = 'default',
): {
  maxTokens?: number;
  trimWhitespaceSuffix?: boolean;
} | undefined {
  if (variant !== 'local-fast') {
    return undefined;
  }

  // remote 경로 평가는 유지하고 싶어서, 응답 길이 제한은 local-fast에만 적용합니다.
  // 추천 종류별 산출물 길이가 다르므로 maxTokens도 타입별로 분리합니다.
  switch (payload.recommendation_type) {
    case 'branch_name':
      return {
        maxTokens: LOCAL_FAST_BRANCH_NAME_MAX_TOKENS,
        trimWhitespaceSuffix: true,
      };
    case 'commit_message':
      return {
        maxTokens: LOCAL_FAST_COMMIT_MESSAGE_MAX_TOKENS,
        trimWhitespaceSuffix: true,
      };
    case 'pr_description':
      return {
        maxTokens: LOCAL_FAST_PR_DESCRIPTION_MAX_TOKENS,
        trimWhitespaceSuffix: true,
      };
  }
}

/**
 * recommendation용 user prompt를 생성합니다.
 * naming/message 제약이 비어 있어도 "Not provided"로 고정해 두면
 * 모델이 임의의 정책을 지어내기보다 입력 부재를 그대로 인식하기 쉽습니다.
 */
export function buildRecommendationUserPrompt(
  payload: RecommendationInput,
  variant: RecommendationPromptVariant = 'default',
): string {
  const context = buildRecommendationContext(payload, variant);
  const instructions: string[] = [];

  switch (payload.recommendation_type) {
    case 'branch_name':
      if (variant === 'local-fast') {
        instructions.push(
          'Task:',
          '- Analyze the work intent and branch context.',
          '- Apply naming_constraints first when provided.',
          '- Generate practical and clear branch names.',
          '- Return exactly 3 total candidates: primary_text plus exactly 2 alternatives.',
          '- Each candidate must be a short branch slug only, with no explanation text.',
          '- Keep alternative_texts meaningfully distinct.'
        );
      } else {
        instructions.push(
          'Task (Chain of Thought):',
          '- Step 1 (의도 파악): 주어진 작업 의도(work_intent)와 브랜치 컨텍스트(branch_context: 기존 브랜치 목록 및 추천 이력)를 분석한다.',
          '- Step 2 (포맷팅): 주어진 제약 사항(naming_constraints)이 있다면 이를 우선적으로 적용하여 팀 컨벤션에 맞는 브랜치명을 생성한다.',
          '',
          'Additional Instructions:',
          '- Generate practical and clear branch names.',
          '- alternative_texts must contain slightly different phrasing or focus.'
        );
      }
      break;

    case 'commit_message':
      if (variant === 'local-fast') {
        instructions.push(
          'Task:',
          '- Use work_intent, change_summary, diff_summary, and branch_context to identify the main code change.',
          '- Ignore minor formatting-only edits unless they are the main change.',
          '- Return exactly 3 total candidates: primary_text plus exactly 2 alternatives.',
          '- Every candidate must be a one-line subject only with no body text.',
          '- primary_text should be the best commit message candidate.',
          '- Keep alternative_texts practical and distinct.'
        );
      } else {
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
      }
      break;

    case 'pr_description':
      if (variant === 'local-fast') {
        instructions.push(
          'Task:',
          '- Identify the PR purpose from change_summary, work_intent, diff_summary, and branch_context.',
          '- If template is provided, preserve its section headings and order as closely as possible.',
          '- Write concrete markdown content reviewers can scan quickly.',
          '- primary_text must be the full PR description markdown.',
          '- Return exactly 1 PR draft in primary_text and keep alternative_texts empty.',
          '- Keep each section concise with short bullets or short sentences only.'
        );
      } else {
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
      }
      break;
  }

  return [
    context,
    '',
    ...instructions,
  ].join('\n');
}
