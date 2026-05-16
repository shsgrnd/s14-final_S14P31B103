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

/**
 * ParsedAiResult에서 모델이 실제로 생성한 핵심 본문(Target) 필드들을 추출합니다.
 * 
 * [설계 의도]
 * - 이 함수가 반환하는 객체는 추후 SFT/DPO 모델 학습을 위한 정답지(Output) 데이터로 사용됩니다.
 * - 시스템 메타데이터(proposal_id, session_id 등)는 당장 이 JSON 파일이 어떤 DB 데이터와
 *   연결되어 있는지 추적(디버깅 및 로컬 DB 복구)하기 위해 일단 함께 저장해 둡니다.
 * - 단, 최종적으로 GPU 학습용 .jsonl 파일을 뽑아낼 때(export-pipeline.ts)는
 *   이 시스템 메타데이터들을 필터링하여 완전히 제거합니다. (할루시네이션 방지 목적)
 */
function extractParsedResultFields(parsedResult: ParsedAiResult): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    // 시스템 메타데이터 (DB/통계용으로 저장하되, 최종 Export 시에는 필터링됨)
    proposal_id: parsedResult.proposal_id,
    session_id: parsedResult.session_id,
    ai_request_id: parsedResult.ai_request_id,
    parser_version: parsedResult.parser_version,
    confidence_score: parsedResult.confidence_score ?? null,
    
    // 핵심 속성 (SFT/DPO 학습을 위한 실제 타깃 데이터)
    feature_type: parsedResult.feature_type,
    title: parsedResult.title,
    summary: parsedResult.summary,
    explanation: parsedResult.explanation ?? null,
  };

  if (parsedResult.feature_type === 'merge_patch_draft') {
    fields.merged_code_ref = parsedResult.merged_code_ref;
    fields.applied_files = parsedResult.applied_files;
    fields.validation_summary = parsedResult.validation_summary;
  } else if (parsedResult.feature_type === 'conflict_explanation') {
    fields.cause_summary = parsedResult.cause_summary;
    fields.detailed_explanation = parsedResult.detailed_explanation;
    fields.related_files = parsedResult.related_files;
    fields.recommended_resolution_direction = parsedResult.recommended_resolution_direction;
    fields.risk_level = parsedResult.risk_level;
  } else if (parsedResult.feature_type === 'merge_mediation') {
    fields.recommended_option = parsedResult.recommended_option;
    fields.tradeoffs = parsedResult.tradeoffs;
    fields.recommended_next_action = parsedResult.recommended_next_action;
  } else if (parsedResult.feature_type === 'recommendation') {
    fields.recommendation_type = parsedResult.recommendation_type;
    fields.primary_text = parsedResult.primary_text;
    fields.alternative_texts = parsedResult.alternative_texts;
    fields.generation_basis_summary = parsedResult.generation_basis_summary ?? null;
    fields.format_notes = parsedResult.format_notes ?? null;
    fields.warnings = parsedResult.warnings ?? [];
  }

  return fields;
}

/**
 * 최종 채택된(또는 수정된) 결과를 바탕으로 SFT(또는 DPO의 chosen) 학습용 아티팩트 페이로드를 생성합니다.
 */
function buildChosenArtifactPayload(
  parsedResult: ParsedAiResult,
  feedback: ProposalFeedback,
): Record<string, unknown> {
  return {
    ...extractParsedResultFields(parsedResult),
    // 사용자의 피드백 및 최종 채택 코드 정보
    feedback_id: feedback.feedback_id,
    selection_status: feedback.selection_status,
    final_text: feedback.final_text ?? null,
    final_code_ref: feedback.final_code_ref ?? null,
    final_explanation: feedback.final_explanation ?? null,
    quality_tag: feedback.quality_tag ?? null,
    feedback_note: feedback.feedback_note ?? null,
  };
}

/**
 * 기각된(Rejected) 결과를 바탕으로 DPO 비교 학습용 아티팩트 페이로드를 생성합니다.
 * 주로 모델이 생성한 원문 그대로를 비채택(Rejected) 샘플로 사용합니다.
 */
function buildRejectedArtifactPayload(
  parsedResult: ParsedAiResult,
  feedback: ProposalFeedback,
  rejectedReason: string | undefined,
): Record<string, unknown> {
  return {
    ...extractParsedResultFields(parsedResult),
    // 거절 사유 및 관련 피드백 정보
    feedback_id: feedback.feedback_id,
    rejected_reason: rejectedReason ?? feedback.feedback_note ?? null,
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
