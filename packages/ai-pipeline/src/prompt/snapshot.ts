/**
 * 스냅샷 자동 요약 기능에서 사용하는 AI 프롬프트 정의 모음입니다.
 *
 * 스냅샷이 생성될 때 코드 변경 내역(diff)을 AI에게 전달하면,
 * AI가 변경 내용을 분석하여 스냅샷 이름으로 사용할 짧은 제목(한 줄 요약)을 반환합니다.
 * 반환된 요약은 SnapshotService에서 별도 태그 없이 그대로 스냅샷 제목으로 저장합니다.
 */

export type SnapshotSummaryLanguage = 'ko' | 'en';

/**
 * 스냅샷 요약 AI의 역할과 응답 규칙을 지정하는 시스템 프롬프트를 반환합니다.
 *
 * - JSON 포맷이나 마크다운 없이 순수 텍스트 한 줄만 반환하도록 유도합니다.
 * - 50자 이내의 짧은 제목 형식을 기본으로 합니다.
 */
export function getSnapshotSummarySystemPrompt(
  language: SnapshotSummaryLanguage = 'ko',
): string {
  const languageInstruction = language === 'en'
    ? 'Write the summary in English.'
    : 'Write the summary in Korean.';
  const examples = language === 'en'
    ? [
      'Example: "Fix README getting started typos"',
      'Example: "Improve login UI and fix validation bug"',
    ]
    : [
      'Example: "README 시작 가이드 오타 수정"',
      'Example: "로그인 화면 UI 개선 및 버그 수정"',
    ];

  return [
    'You are an expert developer assistant summarizing code changes.',
    'Your task is to generate a very short, single-line title that summarizes the provided git diff.',
    'CRITICAL: Output ONLY the summary text itself. Do not include any conversational fillers, intro, or outro (e.g., do not say "Here is your summary:" or "Sure!").',
    'Do not use any markdown formatting like bolding or code blocks.',
    'Do not end with a period.',
    'Keep it under 50 characters if possible.',
    languageInstruction,
    ...examples,
  ].join('\n');
}

/**
 * AI에게 전달할 사용자 프롬프트를 생성합니다.
 *
 * @param diffText 스냅샷 생성 시 기록된 patch.diff 텍스트 (unified diff 포맷)
 * @returns AI에게 전달할 요약 요청 메시지 문자열
 */
export function buildSnapshotSummaryUserPrompt(diffText: string): string {
  return [
    'Please summarize the following code changes into a single-line title.',
    '',
    'Diff Text:',
    diffText,
  ].join('\n');
}
