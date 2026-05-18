import { ConflictCandidate, MergeProposalInput } from '@gitcat/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';

const MAX_RUNTIME_CONTEXT_PROMPT_CHARS = 6000;
const MAX_RUNTIME_CONTEXT_RESULTS = 6;
const MAX_RUNTIME_CONTEXT_ITEM_CHARS = 900;

type RuntimeContextBundleItem = {
  source_kind?: string;
  source_type?: string;
  title?: string;
  file_path?: string;
  score?: number;
  recency_score?: number;
  file_match_score?: number;
  content?: string;
  summary?: string;
};

type RuntimeContextBundlePayload = {
  ai_context_summary?: string;
  metadata?: {
    source_count?: number;
    result_count?: number;
  };
  budget?: {
    used_chars?: number;
    max_chars?: number;
    truncated?: boolean;
  };
  items?: RuntimeContextBundleItem[];
  results?: RuntimeContextBundleItem[];
};

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
 * merge_patch_draft는 충돌 블록을 대체할 최종 해결 코드 생성용 기능입니다.
 * 시스템 프롬프트에서 출력 필드를 고정해 두면 파서와 mock 계약을 안정적으로 유지할 수 있습니다.
 */
export function getMergePatchDraftSystemPrompt(): string {
  return [
    'Task: Draft the final resolved code to replace a merge conflict block.',
    'Rules:',
    '- Preserve intent of both branches.',
    '- Prefer minimal changes; do not rewrite unrelated code.',
    '- Treat the current Conflict Candidates source_code, target_code, and base_code as the primary truth.',
    '- Use Retrieved Runtime Context only as supporting local history: project conventions, prior accepted fixes, feedback, and validation hints.',
    '- Do not copy retrieved history blindly; adapt it only when it matches the current file, conflict reason, and branch intent.',
    '- If Retrieved Runtime Context conflicts with the current Conflict Candidates, follow the current Conflict Candidates.',
    '- Prefer high-score, same-file, recent, accepted/useful feedback over stale or low-score retrieved items.',
    '- Return valid JSON ONLY. No markdown, no prose, no ```json blocks.',
    '- Do NOT include IDs (proposal_id, session_id, etc.) or static fields (status, version).',
    '',
    'Output Schema:',
    JSON.stringify({
      title: "string",
      summary: "string",
      explanation: "string (short reasoning)",
      confidence_score: 0.9,
      merged_code: "string (the final resolved code snippet to replace the conflict block)",
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

  const runtimeContext = await readRuntimeContextBundle(payload.context_bundle_ref, workspaceRoot);

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
    '',
    'Retrieved Runtime Context:',
    runtimeContext,
  ].join('\n');
}

async function readRuntimeContextBundle(
  contextBundleRef: string | undefined,
  workspaceRoot?: string,
): Promise<string> {
  if (!contextBundleRef) {
    return 'N/A';
  }

  if (!workspaceRoot) {
    return `ref=${contextBundleRef}`;
  }

  const normalizedRef = contextBundleRef.replace(/\\/g, '/');
  if (path.isAbsolute(normalizedRef)) {
    return `ref=${contextBundleRef}`;
  }

  const root = path.resolve(workspaceRoot);
  const absolutePath = path.resolve(root, normalizedRef);
  const isInsideWorkspace = absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`);
  if (!isInsideWorkspace) {
    return `ref=${contextBundleRef}`;
  }

  try {
    const fileContent = await fs.readFile(absolutePath, 'utf8');
    const parsed = JSON.parse(fileContent) as RuntimeContextBundlePayload;
    const items = parsed.results ?? parsed.items ?? [];
    if (items.length === 0) {
      return formatRuntimeContextHeader({
        contextBundleRef,
        bundle: parsed,
        injectedChars: 0,
        promptTruncated: false,
      }, 'No local history matches found.');
    }

    return formatRuntimeContextForPrompt(contextBundleRef, parsed, items);
  } catch {
    return `ref=${contextBundleRef}`;
  }
}

function formatRuntimeContextForPrompt(
  contextBundleRef: string,
  bundle: RuntimeContextBundlePayload,
  items: RuntimeContextBundleItem[],
): string {
  const selectedItems = items
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, MAX_RUNTIME_CONTEXT_RESULTS);
  const omittedByCount = Math.max(0, items.length - selectedItems.length);

  const bodySections = [
    bundle.ai_context_summary ? `summary:\n${truncateText(bundle.ai_context_summary, 1800).text}` : undefined,
    ...selectedItems.map((item, index) => formatRuntimeContextItem(item, index)),
  ].filter((section): section is string => Boolean(section));
  const body = bodySections.join('\n\n');
  const truncatedBody = truncateText(body, MAX_RUNTIME_CONTEXT_PROMPT_CHARS);
  const promptTruncated = truncatedBody.truncated || omittedByCount > 0;
  const header = formatRuntimeContextHeader({
    contextBundleRef,
    bundle,
    injectedChars: truncatedBody.text.length,
    promptTruncated,
    omittedResults: omittedByCount,
  });

  return [
    header,
    truncatedBody.text,
    truncatedBody.truncated ? '[runtime_context_prompt_truncated]' : undefined,
  ].filter(Boolean).join('\n\n');
}

function formatRuntimeContextHeader(
  input: {
    contextBundleRef: string;
    bundle: RuntimeContextBundlePayload;
    injectedChars: number;
    promptTruncated: boolean;
    omittedResults?: number;
  },
  emptyMessage?: string,
): string {
  const resultCount = input.bundle.metadata?.result_count
    ?? input.bundle.results?.length
    ?? input.bundle.items?.length
    ?? 0;

  return [
    `rag_executed=true`,
    `context_bundle_ref=${input.contextBundleRef}`,
    `source_count=${input.bundle.metadata?.source_count ?? 'N/A'}`,
    `result_count=${resultCount}`,
    `bundle_budget=${input.bundle.budget?.used_chars ?? 0}/${input.bundle.budget?.max_chars ?? 'N/A'} chars`,
    `bundle_truncated=${input.bundle.budget?.truncated ? 'true' : 'false'}`,
    `injected_chars=${input.injectedChars}`,
    `prompt_truncated=${input.promptTruncated ? 'true' : 'false'}`,
    input.omittedResults ? `omitted_results=${input.omittedResults}` : undefined,
    emptyMessage,
  ].filter(Boolean).join('\n');
}

function formatRuntimeContextItem(item: RuntimeContextBundleItem, index: number): string {
  const content = item.content ?? item.summary ?? '';
  const truncatedContent = truncateText(content, MAX_RUNTIME_CONTEXT_ITEM_CHARS);

  return [
    `Item ${index + 1}:`,
    `- source_kind: ${item.source_kind ?? 'N/A'}`,
    `- source_type: ${item.source_type ?? 'unknown'}`,
    `- title: ${item.title ?? 'N/A'}`,
    `- file_path: ${item.file_path ?? 'N/A'}`,
    `- score: ${item.score ?? 0}`,
    `- recency_score: ${item.recency_score ?? 0}`,
    `- file_match_score: ${item.file_match_score ?? 0}`,
    `- content:`,
    truncatedContent.truncated ? `${truncatedContent.text}\n[item_content_truncated]` : truncatedContent.text,
  ].join('\n');
}

function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }

  return {
    text: text.slice(0, Math.max(0, maxChars - 12)).trimEnd(),
    truncated: true,
  };
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
 * LLM에게 "충돌 블록을 어떤 최종 코드로 대체해야 하는지"를 명확히 전달합니다.
 */
export async function buildMergePatchDraftUserPrompt(payload: MergeProposalInput, workspaceRoot?: string): Promise<string> {
  return [
    await buildSharedMergeContext(payload, workspaceRoot),
    '',
    'Task:',
    '- Propose a safe merge draft integrating source and target changes.',
    '- Use Retrieved Runtime Context to infer local project conventions and prior successful resolution patterns, but keep the current conflict candidate as the decision source.',
    '- Return the EXACT resolved code snippet in the `merged_code` field to replace the conflict block.',
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
