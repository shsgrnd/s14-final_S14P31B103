import {
  DatasetType,
  ParsedAiResult,
  ProposalFeedback,
  SourceType,
  TrainingCandidatePayload,
  TrainingCandidatePayloadSchema,
} from '@gitcat/shared-types';

export interface BuildTrainingCandidatePayloadInput {
  parsed_result: ParsedAiResult;
  feedback: ProposalFeedback;
  dataset_type: DatasetType;
  prompt_ref?: string;
  chosen_ref?: string;
  rejected_ref?: string;
  training_candidate_id?: string;
  is_approved?: boolean;
  is_exported?: boolean;
}

/**
 * training_candidate_payload 식별자를 생성합니다.
 * feedback/proposal과 같은 방식으로 로컬 MVP 문서의 ID 규칙을 따릅니다.
 */
function generateTrainingCandidateId(now: Date = new Date()): string {
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `tc_${yyyymmdd}_${suffix}`;
}

/**
 * 현재 문서 기준 source_type은 3개만 공식화돼 있습니다.
 * merge_mediation는 아직 source_type enum에 별도 값이 없으므로,
 * 합의 전까지는 학습 후보 자동 생성 대상에서 제외합니다.
 */
function resolveSourceType(parsedResult: ParsedAiResult): SourceType {
  switch (parsedResult.feature_type) {
    case 'merge_patch_draft':
      return 'merge_proposal';
    case 'conflict_explanation':
      return 'conflict_explanation';
    case 'recommendation':
      return 'recommendation';
    case 'merge_mediation':
      throw new Error(
        'merge_mediation is not yet mapped to training_candidate.source_type in the current AI docs',
      );
  }
}

/**
 * chosen_ref / rejected_ref는 실제 저장된 산출물 참조를 가리켜야 하므로
 * 여기서는 임의 생성하지 않고 호출자가 명시적으로 넘기도록 둡니다.
 * 이렇게 하면 나중에 file-storage 규칙이 바뀌어도 이 생성기 자체는 안정적으로 유지됩니다.
 */
export function buildTrainingCandidatePayload(
  input: BuildTrainingCandidatePayloadInput,
): TrainingCandidatePayload {
  const payload: TrainingCandidatePayload = {
    training_candidate_id: input.training_candidate_id ?? generateTrainingCandidateId(),
    proposal_id: input.parsed_result.proposal_id,
    feedback_id: input.feedback.feedback_id,
    dataset_type: input.dataset_type,
    source_type: resolveSourceType(input.parsed_result),
    prompt_ref: input.prompt_ref,
    chosen_ref: input.chosen_ref,
    rejected_ref: input.rejected_ref,
    is_approved: input.is_approved ?? false,
    is_exported: input.is_exported ?? false,
  };

  return TrainingCandidatePayloadSchema.parse(payload);
}
