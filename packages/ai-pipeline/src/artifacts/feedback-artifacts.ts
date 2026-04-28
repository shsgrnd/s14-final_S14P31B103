import { ParsedAiResult, SelectionStatus } from '@gitcat/shared-types';
import { writeFinalCodeFile } from '@gitcat/storage';

export interface MaterializeFeedbackArtifactsInput {
  workspaceRoot?: string;
  parsedResult: ParsedAiResult;
  selectionStatus: SelectionStatus;
  feedbackId: string;
  // 사용자가 patch를 수동 수정한 뒤 확정한 최종 코드 본문입니다.
  finalCode?: string;
  // 최종 코드가 어느 원본 파일에 대응되는지 남기기 위한 힌트입니다.
  relativeFilePath?: string;
}

export interface MaterializedFeedbackArtifacts {
  final_code_ref?: string;
  final_code_absolute_path?: string;
}

function getInlineText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * feedback 저장 직전에 최종 채택본 artifact를 실제 파일로 남깁니다.
 * 현재 스프린트에서는 merge_patch_draft의 edited 케이스만 대상으로 삼아
 * final_code_ref를 안정적으로 채우는 최소 흐름만 구현합니다.
 */
export async function materializeFeedbackArtifacts(
  input: MaterializeFeedbackArtifactsInput,
): Promise<MaterializedFeedbackArtifacts> {
  // workspace가 없으면 로컬 artifact를 만들 수 없으므로
  // payload 생성 단계에서 ref 없이 그대로 통과시킵니다.
  if (!input.workspaceRoot) {
    return {};
  }

  // 현재 final_code_ref가 필요한 공식 케이스는 merge_patch_draft 뿐입니다.
  if (input.parsedResult.feature_type !== 'merge_patch_draft') {
    return {};
  }

  // accepted/rejected는 "최종 코드 본문" 저장이 필수 규칙이 아니므로
  // 이번 스프린트 범위에서는 edited 케이스만 파일로 남깁니다.
  if (input.selectionStatus !== 'edited') {
    return {};
  }

  const finalCode = getInlineText(input.finalCode);
  // 상위 계층이 아직 최종 코드 본문을 넘기지 않았다면
  // 여기서는 예외를 던지지 않고 ref 미생성 상태로 반환합니다.
  if (!finalCode) {
    return {};
  }

  const storedFinalCode = await writeFinalCodeFile(
    input.workspaceRoot,
    input.parsedResult.session_id,
    input.feedbackId,
    input.relativeFilePath,
    finalCode,
  );

  return {
    final_code_ref: storedFinalCode.ref,
    final_code_absolute_path: storedFinalCode.absolute_path,
  };
}
