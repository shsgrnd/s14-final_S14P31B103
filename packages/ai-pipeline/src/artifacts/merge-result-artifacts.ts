import {
  FeatureType,
  MergePatchDraftResult,
} from '@gitcat/shared-types';
import {
  writeMergedCodeFile,
} from '@gitcat/storage';

interface MergePatchDraftArtifactPayload
  extends Partial<MergePatchDraftResult> {
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
  const hasMergedCodeRef = getInlineText(payload.merged_code_ref) !== undefined;
  const inlineMergedCode = getInlineText(payload.merged_code);
  const primaryFile = getAppliedFiles(payload.applied_files)[0];

  // 새 merge_patch_draft 계약은 merged_code 본문 또는 이미 저장된 merged_code_ref만 성공 경로로 허용합니다.
  if (inlineMergedCode) {
    const storedMergedCode = await writeMergedCodeFile(
      input.workspaceRoot,
      input.sessionId,
      input.proposalId,
      primaryFile,
      inlineMergedCode,
    );
    payload.merged_code_ref = storedMergedCode.ref;
  } else if (!hasMergedCodeRef) {
    throw new Error('merge_patch_draft requires a non-empty merged_code payload.');
  }

  // inline 본문은 저장 후 더 이상 외부 계약에 노출할 필요가 없으므로 제거합니다.
  // 이후 단계에는 "실제 파일을 가리키는 ref만 남는다"는 규칙을 유지합니다.
  delete payload.merged_code;

  // Partial<...> 타입을 그대로 반환하지 않고 새 객체로 펼쳐서
  // parser 단계의 일반 JSON payload처럼 다루기 쉽게 맞춥니다.
  return {
    ...payload,
  };
}
