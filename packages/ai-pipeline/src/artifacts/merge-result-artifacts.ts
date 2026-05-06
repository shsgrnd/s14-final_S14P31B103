import {
  FeatureType,
  MergePatchDraftResult,
} from '@gitcat/shared-types';
import {
  writeMergePatchFile,
  writeMergedCodeFile,
} from '@gitcat/storage';

interface MergePatchDraftArtifactPayload
  extends Partial<MergePatchDraftResult> {
  // parsed_ai_result 정식 스키마에는 ref만 남기고,
  // 저장 직전 단계에서만 inline 본문을 임시로 허용합니다.
  diff_patch?: string;
  merged_code?: string;
}

export interface MaterializeAiArtifactsInput {
  workspaceRoot?: string;
  proposalId: string;
  sessionId: string;
  featureType: FeatureType;
  parsedJson: Record<string, unknown>;
}

function getInlineText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getAppliedFiles(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function buildPatchArtifactFallback(
  payload: MergePatchDraftArtifactPayload,
): string {
  const appliedFiles = getAppliedFiles(payload.applied_files);

  return [
    '# GitCat merge_patch_draft artifact',
    '',
    'The model returned a patch ref without inline diff content.',
    'This fallback artifact preserves the proposal summary for demo-time file storage.',
    '',
    `Title: ${payload.title ?? 'Untitled proposal'}`,
    `Summary: ${payload.summary ?? 'No summary provided'}`,
    `Explanation: ${payload.explanation ?? 'No explanation provided'}`,
    `Applied Files: ${appliedFiles.join(', ') || 'Not provided'}`,
    `Validation Required: ${payload.validation_required ? 'true' : 'false'}`,
    `Validation Summary: ${payload.validation_summary ?? 'Not provided'}`,
  ].join('\n');
}

function buildMergedCodeFallback(
  payload: MergePatchDraftArtifactPayload,
): string {
  const appliedFiles = getAppliedFiles(payload.applied_files);

  return [
    '// GitCat merge_patch_draft artifact',
    '// The model returned a merged_code_ref without inline merged code.',
    '// This fallback artifact preserves the proposal summary for demo-time file storage.',
    '',
    `// Title: ${payload.title ?? 'Untitled proposal'}`,
    `// Summary: ${payload.summary ?? 'No summary provided'}`,
    `// Explanation: ${payload.explanation ?? 'No explanation provided'}`,
    `// Applied Files: ${appliedFiles.join(', ') || 'Not provided'}`,
  ].join('\n');
}

export async function materializeAiArtifacts(
  input: MaterializeAiArtifactsInput,
): Promise<Record<string, unknown>> {
  // 이번 스프린트 저장 범위는 merge_patch_draft의 로컬 artifact 생성까지만 포함합니다.
  // 다른 feature_type은 그대로 통과시켜 이후 save-ready input 단계에서 처리합니다.
  if (input.featureType !== 'merge_patch_draft' || !input.workspaceRoot) {
    return input.parsedJson;
  }

  const payload = {
    ...input.parsedJson,
  } as MergePatchDraftArtifactPayload;
  const hasDiffRef = getInlineText(payload.diff_patch_ref) !== undefined;
  const hasMergedCodeRef = getInlineText(payload.merged_code_ref) !== undefined;
  const inlineDiffPatch = getInlineText(payload.diff_patch);
  const inlineMergedCode = getInlineText(payload.merged_code);
  const primaryFile = getAppliedFiles(payload.applied_files)[0];

  // 모델이 diff 본문을 같이 줬으면 그 내용을 저장하고,
  // ref만 준 경우에도 시연용 fallback artifact 파일은 남겨 둡니다.
  if (inlineDiffPatch || hasDiffRef) {
    const storedPatch = await writeMergePatchFile(
      input.workspaceRoot,
      input.sessionId,
      input.proposalId,
      inlineDiffPatch ?? buildPatchArtifactFallback(payload),
    );
    payload.diff_patch_ref = storedPatch.ref;
  }

  // merged_code도 같은 규칙을 따릅니다.
  // 가능하면 실제 코드 본문을 저장하고, 없으면 요약 기반 fallback 파일을 생성합니다.
  if (inlineMergedCode || hasMergedCodeRef) {
    const storedMergedCode = await writeMergedCodeFile(
      input.workspaceRoot,
      input.sessionId,
      input.proposalId,
      primaryFile,
      inlineMergedCode ?? buildMergedCodeFallback(payload),
    );
    payload.merged_code_ref = storedMergedCode.ref;
  }

  // inline 본문은 저장 후 더 이상 외부 계약에 노출할 필요가 없으므로 제거합니다.
  // 이후 단계에는 "실제 파일을 가리키는 ref만 남는다"는 규칙을 유지합니다.
  delete payload.diff_patch;
  delete payload.merged_code;

  // Partial<...> 타입을 그대로 반환하지 않고 새 객체로 펼쳐서
  // parser 단계의 일반 JSON payload처럼 다루기 쉽게 맞춥니다.
  return {
    ...payload,
  };
}
