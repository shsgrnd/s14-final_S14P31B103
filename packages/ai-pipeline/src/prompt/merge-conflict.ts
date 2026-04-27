import { ConflictCandidate, MergeProposalInput } from '@gitcat/shared-types';

/**
 * 병합 계열 feature가 공통으로 참고하는 컨텍스트를 문자열로 정리합니다.
 * LLM이 구조화된 입력을 잃지 않도록 "프로젝트/브랜치/파일/충돌 후보" 순서로 고정합니다.
 */
function buildSharedMergeContext(payload: MergeProposalInput): string {
  const relatedFiles =
    payload.related_files.length > 0
      ? payload.related_files.map((file) => `- ${file}`).join('\n')
      : '- none';

  const conflictCandidates = payload.conflict_candidates
    .map((candidate, index) => formatConflictCandidate(candidate, index))
    .join('\n\n');

  return [
    `Project ID: ${payload.project_id}`,
    `Session ID: ${payload.session_id}`,
    `Schema Version: ${payload.schema_version}`,
    `Feature Type: ${payload.feature_type}`,
    `Current Branch: ${payload.current_branch}`,
    `Target Branch: ${payload.target_branch}`,
    `Workspace Summary: ${payload.workspace_summary ?? 'Not provided'}`,
    `Risk Summary: ${payload.risk_summary ?? 'Not provided'}`,
    `Working Tree Diff Ref: ${payload.working_tree_diff_ref}`,
    '',
    'Related Files:',
    relatedFiles,
    '',
    'Conflict Candidates:',
    conflictCandidates,
  ].join('\n');
}

/**
 * 충돌 후보 하나를 읽기 쉬운 블록으로 풀어줍니다.
 * source / target / base 코드를 모두 노출해 두면, 어떤 변경이 실제로 충돌하는지
 * 팀원이 프롬프트를 검토할 때도 맥락을 따라가기 쉽습니다.
 */
function formatConflictCandidate(candidate: ConflictCandidate, index: number): string {
  const location = `${candidate.file_path}:${candidate.line_start}-${candidate.line_end}`;

  return [
    `Candidate ${index + 1}`,
    `- candidate_id: ${candidate.candidate_id}`,
    `- analysis_id: ${candidate.analysis_id}`,
    `- location: ${location}`,
    `- detected_by: ${candidate.detected_by}`,
    `- conflict_type: ${candidate.conflict_type ?? 'Not provided'}`,
    `- risk_level: ${candidate.risk_level ?? 'Not provided'}`,
    `- reason_summary: ${candidate.reason_summary ?? 'Not provided'}`,
    `- source_code:`,
    candidate.source_code,
    `- target_code:`,
    candidate.target_code,
    `- base_code:`,
    candidate.base_code ?? 'Not provided',
  ].join('\n');
}

/**
 * 충돌 설명 결과는 "왜 충돌하는지"와 "어떤 방향으로 풀면 되는지"가 핵심입니다.
 * 따라서 설명형 필드를 강제하고, 코드 블록 없이 JSON만 반환하도록 명시합니다.
 */
export function getConflictExplanationSystemPrompt(): string {
  return [
    'You are an expert developer and Git merge conflict analysis assistant.',
    'Analyze the merge context and explain why the conflict or integration risk occurred.',
    'Return ONLY a valid JSON object.',
    'Do not include markdown code blocks.',
    'Do not invent files or branches that are not present in the payload.',
    'The JSON must match the conflict_explanation parsed_ai_result contract.',
    'Required JSON fields: title, summary, cause_summary, detailed_explanation, related_files, recommended_resolution_direction, risk_level.',
    'Optional JSON fields: explanation, confidence_score.',
    'risk_level must be one of: low, medium, high, critical.',
    'related_files must only include files that appear in related_files or conflict_candidates.',
  ].join(' ');
}

/**
 * merge_patch_draft는 실제 patch/code ref를 포함하는 초안 생성용 기능입니다.
 * 시스템 프롬프트에서 필요한 출력 필드를 고정해 두면 파서와 mock 계약을 유지하기 쉽습니다.
 */
export function getMergePatchDraftSystemPrompt(): string {
  return [
    'You are an expert developer and Git merge resolution assistant.',
    'Analyze the merge context and propose a safe merge draft.',
    'Return ONLY a valid JSON object.',
    'Do not include markdown code blocks.',
    'The JSON must match the merge_patch_draft parsed_ai_result contract.',
    'Required JSON fields: title, summary, applied_files, validation_required, validation_summary.',
    'At least one of diff_patch_ref or merged_code_ref must be included.',
    'When possible, also include diff_patch as unified diff text or merged_code as the full merged file content so the platform can store a real local artifact.',
    'If you include diff_patch or merged_code, still keep applied_files accurate.',
    'Optional JSON fields: explanation, confidence_score.',
    'applied_files must be an array of file paths present in the payload context.',
  ].join(' ');
}

/**
 * merge_mediation는 "어떤 선택지가 있는지"를 비교하는 기능이라,
 * 코드 초안보다 trade-off 설명이 더 중요합니다.
 */
export function getMergeMediationSystemPrompt(): string {
  return [
    'You are an expert developer and merge mediation assistant.',
    'Compare resolution options and recommend the best next step.',
    'Return ONLY a valid JSON object.',
    'Do not include markdown code blocks.',
    'The JSON must match the merge_mediation parsed_ai_result contract.',
    'Required JSON fields: title, summary, recommended_option, tradeoffs, recommended_next_action.',
    'Optional JSON fields: explanation, confidence_score.',
    'tradeoffs must be an array of concise, concrete statements.',
  ].join(' ');
}

/**
 * conflict_explanation용 user prompt를 생성합니다.
 * 같은 merge context를 쓰더라도 "원인 설명"에 집중하도록 마지막 지시문만 분리합니다.
 */
export function buildConflictUserPrompt(payload: MergeProposalInput): string {
  return [
    buildSharedMergeContext(payload),
    '',
    'Task:',
    '- Explain the root cause of the conflict or integration risk.',
    '- Focus on interface mismatches, semantic conflicts, or adjacent edits when relevant.',
    '- Summarize the likely resolution direction in a way a developer can act on immediately.',
  ].join('\n');
}

/**
 * merge_patch_draft용 user prompt를 생성합니다.
 * 실제 patch 본문은 아직 외부 artifact ref로 관리하므로, LLM에게는 "어떤 파일에 어떤 방향으로"
 * 초안을 만들어야 하는지만 명확히 전달합니다.
 */
export function buildMergePatchDraftUserPrompt(payload: MergeProposalInput): string {
  return [
    buildSharedMergeContext(payload),
    '',
    'Task:',
    '- Propose a merge draft that integrates the source and target changes safely.',
    '- Prefer minimal edits that preserve behavior unless the context clearly requires a larger change.',
    '- Identify which files should be applied and whether human validation is required.',
    '- Prefer returning diff_patch as a unified diff. If that is not practical, return merged_code for the primary file instead.',
  ].join('\n');
}

/**
 * merge_mediation용 user prompt를 생성합니다.
 * 팀원이 나중에 다른 mediation 전략을 추가하더라도, 공통 컨텍스트는 유지하고
 * 마지막 작업 지시문만 바꾸면 되도록 구조를 맞춰 둡니다.
 */
export function buildMergeMediationUserPrompt(payload: MergeProposalInput): string {
  return [
    buildSharedMergeContext(payload),
    '',
    'Task:',
    '- Compare realistic resolution options for this merge situation.',
    '- Recommend the safest and most practical option for the team to take next.',
    '- Make tradeoffs concrete so a reviewer can choose quickly.',
  ].join('\n');
}
