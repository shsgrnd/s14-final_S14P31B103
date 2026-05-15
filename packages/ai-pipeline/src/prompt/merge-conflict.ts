import { ConflictCandidate, MergeProposalInput } from '@gitcat/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 병합 계열 feature가 공통으로 참고하는 컨텍스트를 문자열로 정리합니다.
 * LLM이 구조화된 입력을 잃지 않도록 "프로젝트/브랜치/파일/충돌 후보" 순서로 고정합니다.
 */
function formatConflictCandidate(candidate: ConflictCandidate, index: number): string {
  const location = `${candidate.file_path}:${candidate.line_start}-${candidate.line_end}`;

  return [
    `Candidate ${index + 1}:`,
    `- location: ${location}`,
    `- type: ${candidate.conflict_type ?? 'N/A'}`,
    `- reason: ${candidate.reason_summary ?? 'N/A'}`,
    `- source_code:`,
    candidate.source_code,
    `- target_code:`,
    candidate.target_code,
    `- base_code:`,
    candidate.base_code ?? 'N/A',
  ].join('\n');
}

/**
 * 충돌 설명 결과는 "왜 충돌하는지"와 "어떤 방향으로 풀면 되는지"가 핵심입니다.
 * 따라서 설명형 필드를 강제하고, 코드 블록 없이 JSON만 반환하도록 명시합니다.
 */
export function getConflictExplanationSystemPrompt(): string {
  return [
    '너는 시니어 소프트웨어 엔지니어이자 Git 마스터야.',
    '사용자가 겪고 있는 코드 충돌의 기술적 원인을 분석하고 중재안을 제시해줘.',
    '답변을 작성하기 전에 반드시 다음 단계를 거쳐 논리적으로 생각하고 출력해:',
    '1. Base 대비 각 브랜치의 변경 의도 파악',
    '2. 두 변경 사항이 충돌하는 기술적 이유 도출',
    '3. 최적의 중재안 생성 (필요시 코드 예시 포함)',
    '[조건]',
    '- 전문적이면서도 친절한 한국어로 답변할 것.',
    '- 불필요한 서론이나 끝인사는 생략할 것.',
    '- Return ONLY a valid JSON object.',
    '- Do not include markdown code blocks.',
    '- The JSON must match the conflict_explanation parsed_ai_result contract.',
    '- Required JSON fields: title, summary, cause_summary, detailed_explanation, related_files, recommended_resolution_direction, risk_level.',
    '- risk_level must be one of: low, medium, high, critical.',
  ].join(' ');
}

/**
 * merge_patch_draft는 실제 patch/code ref를 포함하는 초안 생성용 기능입니다.
 * 시스템 프롬프트에서 필요한 출력 필드를 고정해 두면 파서와 mock 계약을 유지하기 쉽습니다.
 */
export function getMergePatchDraftSystemPrompt(): string {
  return [
    'Task: Draft a merge patch to resolve conflicts between branches.',
    'Rules:',
    '- Preserve intent of both branches.',
    '- Prefer minimal changes; do not rewrite unrelated code.',
    '- Return valid JSON ONLY. No markdown, no prose, no ```json blocks.',
    '- Do NOT include IDs (proposal_id, session_id, etc.) or static fields (status, version).',
    '',
    'Output Schema:',
    JSON.stringify({
      title: "string",
      summary: "string",
      explanation: "string (short reasoning)",
      confidence_score: 0.9,
      diff_patch: "string (unified diff)",
      validation_summary: "string (short)",
      applied_files: ["string"]
    }, null, 2)
  ].join('\n');
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
 * 병합 계열 feature가 공통으로 참고하는 컨텍스트를 문자열로 정리합니다.
 * LLM이 구조화된 입력을 잃지 않도록 "프로젝트/브랜치/파일/충돌 후보" 순서로 고정합니다.
 */
async function buildSharedMergeContext(payload: MergeProposalInput, workspaceRoot?: string): Promise<string> {
  const conflictCandidates = payload.conflict_candidates
    .map((candidate, index) => formatConflictCandidate(candidate, index))
    .join('\n\n');

  let diffContent = payload.working_tree_diff_ref;
  if (workspaceRoot && payload.working_tree_diff_ref) {
    try {
      const fullPath = path.resolve(workspaceRoot, payload.working_tree_diff_ref);
      const fileContent = await fs.readFile(fullPath, 'utf8');
      diffContent = `\n${fileContent}`;
    } catch {
      // Fallback: keep the ref string if file cannot be read
    }
  }

  return [
    `Context:`,
    `- Feature: ${payload.feature_type}`,
    `- Current: ${payload.current_branch}`,
    `- Target: ${payload.target_branch}`,
    `- Workspace: ${payload.workspace_summary ?? 'N/A'}`,
    `- Risk: ${payload.risk_summary ?? 'N/A'}`,
    `- Diff: ${diffContent}`,
    '',
    'Conflict Candidates:',
    conflictCandidates,
  ].join('\n');
}

/**
 * conflict_explanation용 user prompt를 생성합니다.
 * 같은 merge context를 쓰더라도 "원인 설명"에 집중하도록 마지막 지시문만 분리합니다.
 */
export async function buildConflictUserPrompt(payload: MergeProposalInput, workspaceRoot?: string): Promise<string> {
  return [
    await buildSharedMergeContext(payload, workspaceRoot),
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
export async function buildMergePatchDraftUserPrompt(payload: MergeProposalInput, workspaceRoot?: string): Promise<string> {
  return [
    await buildSharedMergeContext(payload, workspaceRoot),
    '',
    'Task:',
    '- Propose a safe merge draft integrating source and target changes.',
    '- Use diff_patch (unified diff) for the primary resolution.',
    '- Keep all explanations and summaries extremely concise.',
  ].join('\n');
}

/**
 * merge_mediation용 user prompt를 생성합니다.
 * 팀원이 나중에 다른 mediation 전략을 추가하더라도, 공통 컨텍스트는 유지하고
 * 마지막 작업 지시문만 바꾸면 되도록 구조를 맞춰 둡니다.
 */
export async function buildMergeMediationUserPrompt(payload: MergeProposalInput, workspaceRoot?: string): Promise<string> {
  return [
    await buildSharedMergeContext(payload, workspaceRoot),
    '',
    'Task:',
    '- Compare realistic resolution options for this merge situation.',
    '- Recommend the safest and most practical option for the team to take next.',
    '- Make tradeoffs concrete so a reviewer can choose quickly.',
  ].join('\n');
}
