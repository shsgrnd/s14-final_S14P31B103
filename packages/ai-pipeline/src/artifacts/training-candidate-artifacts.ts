import {
  DatasetType,
  ParsedAiResult,
  ProposalFeedback,
} from '@gitcat/shared-types';
import {
  writeTrainingChosenFile,
  writeTrainingPromptFile,
  writeTrainingRejectedFile,
} from '@gitcat/storage';

export interface MaterializeTrainingCandidateArtifactsInput {
  workspaceRoot?: string;
  parsedResult: ParsedAiResult;
  feedback: ProposalFeedback;
  datasetType: DatasetType;
  trainingCandidateId: string;
  // 실제 prompt 원문이 있으면 그대로 저장하고,
  // 없으면 prompt_ref는 optional 규칙에 따라 생략합니다.
  promptText?: string;
  // rejected는 DPO 비교 케이스에서만 의미가 있으므로 optional로 둡니다.
  rejectedReason?: string;
}

export interface MaterializedTrainingCandidateArtifacts {
  prompt_ref?: string;
  prompt_absolute_path?: string;
  chosen_ref?: string;
  chosen_absolute_path?: string;
  rejected_ref?: string;
  rejected_absolute_path?: string;
}

function getInlineText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildChosenArtifactPayload(
  parsedResult: ParsedAiResult,
  feedback: ProposalFeedback,
): Record<string, unknown> {
  return {
    proposal_id: parsedResult.proposal_id,
    feedback_id: feedback.feedback_id,
    feature_type: parsedResult.feature_type,
    selection_status: feedback.selection_status,
    final_text: feedback.final_text ?? null,
    final_code_ref: feedback.final_code_ref ?? null,
    final_explanation: feedback.final_explanation ?? null,
    quality_tag: feedback.quality_tag ?? null,
    feedback_note: feedback.feedback_note ?? null,
  };
}

function buildRejectedArtifactPayload(
  parsedResult: ParsedAiResult,
  feedback: ProposalFeedback,
  rejectedReason: string | undefined,
): Record<string, unknown> {
  return {
    proposal_id: parsedResult.proposal_id,
    feedback_id: feedback.feedback_id,
    feature_type: parsedResult.feature_type,
    rejected_reason: rejectedReason ?? feedback.feedback_note ?? null,
    original_summary: parsedResult.summary,
    original_explanation: parsedResult.explanation ?? null,
  };
}

/**
 * training candidate용 prompt/chosen/rejected ref를 실제 로컬 파일로 구체화합니다.
 * chosen/rejected는 feature별 산출물 모양이 달라도 재사용 가능하도록
 * 공통 JSON 래퍼 형태로 저장합니다.
 */
export async function materializeTrainingCandidateArtifacts(
  input: MaterializeTrainingCandidateArtifactsInput,
): Promise<MaterializedTrainingCandidateArtifacts> {
  if (!input.workspaceRoot) {
    return {};
  }

  const result: MaterializedTrainingCandidateArtifacts = {};
  const promptText = getInlineText(input.promptText);

  if (promptText) {
    const storedPrompt = await writeTrainingPromptFile(
      input.workspaceRoot,
      input.trainingCandidateId,
      promptText,
    );

    result.prompt_ref = storedPrompt.ref;
    result.prompt_absolute_path = storedPrompt.absolute_path;
  }

  if (input.datasetType === 'sft' || input.datasetType === 'dpo') {
    const storedChosen = await writeTrainingChosenFile(
      input.workspaceRoot,
      input.trainingCandidateId,
      JSON.stringify(
        buildChosenArtifactPayload(input.parsedResult, input.feedback),
        null,
        2,
      ),
    );

    result.chosen_ref = storedChosen.ref;
    result.chosen_absolute_path = storedChosen.absolute_path;
  }

  if (input.datasetType === 'dpo') {
    const storedRejected = await writeTrainingRejectedFile(
      input.workspaceRoot,
      input.trainingCandidateId,
      JSON.stringify(
        buildRejectedArtifactPayload(
          input.parsedResult,
          input.feedback,
          getInlineText(input.rejectedReason),
        ),
        null,
        2,
      ),
    );

    result.rejected_ref = storedRejected.ref;
    result.rejected_absolute_path = storedRejected.absolute_path;
  }

  return result;
}
