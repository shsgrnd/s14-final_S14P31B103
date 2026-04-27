import {
  ParsedAiResult,
  ProposalFeedback,
  ProposalFeedbackSchema,
  QualityTag,
  SelectionStatus,
} from '@gitcat/shared-types';
import type { CreateProposalFeedbackInput } from '@gitcat/shared-types';

export interface BuildProposalFeedbackPayloadInput {
  parsed_result: ParsedAiResult;
  selection_status: SelectionStatus;
  quality_tag?: QualityTag;
  feedback_note?: string;
  final_text?: string;
  final_code_ref?: string;
  final_explanation?: string;
  feedback_id?: string;
  decided_at?: string;
}

/**
 * proposal_feedback_payload의 기본 ID를 생성합니다.
 * 저장소 구현 전에도 mock/서비스 레이어에서 같은 형식의 식별자를 쓸 수 있도록
 * 문서의 `fb_YYYYMMDD_001` 규칙과 비슷한 형태를 유지합니다.
 */
function generateFeedbackId(now: Date = new Date()): string {
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `fb_${yyyymmdd}_${suffix}`;
}

/**
 * merge 계열 proposal은 기존 저장 계약과의 호환을 위해 merge_proposal_id alias를 함께 둡니다.
 * recommendation은 proposal_id만으로 충분하므로 alias를 만들지 않습니다.
 */
function resolveMergeProposalId(parsedResult: ParsedAiResult): string | undefined {
  return parsedResult.feature_type === 'recommendation'
    ? undefined
    : parsedResult.proposal_id;
}

/**
 * 사용자가 "그대로 수락"한 recommendation은 별도 수정 텍스트가 없어도
 * primary_text를 최종 확정값으로 간주할 수 있습니다.
 */
function resolveFinalText(input: BuildProposalFeedbackPayloadInput): string | undefined {
  if (input.final_text) {
    return input.final_text;
  }

  if (
    input.selection_status === 'accepted' &&
    input.parsed_result.feature_type === 'recommendation'
  ) {
    return input.parsed_result.primary_text;
  }

  return undefined;
}

/**
 * 설명/중재 계열 결과는 "어떤 방향을 채택했는지"가 후속 저장에서 중요합니다.
 * accepted일 때 값을 따로 넘기지 않으면 parsed 결과의 핵심 결론을 기본값으로 사용합니다.
 */
function resolveFinalExplanation(input: BuildProposalFeedbackPayloadInput): string | undefined {
  if (input.final_explanation) {
    return input.final_explanation;
  }

  if (input.selection_status !== 'accepted') {
    return undefined;
  }

  switch (input.parsed_result.feature_type) {
    case 'conflict_explanation':
      return input.parsed_result.recommended_resolution_direction;
    case 'merge_mediation':
      return input.parsed_result.recommended_next_action;
    default:
      return undefined;
  }
}

/**
 * 문서에서 유일하게 "필수"로 고정된 조건은 merge_patch_draft의 edited 케이스입니다.
 * edited인데 최종 코드 ref가 없으면 저장 이후에 사용자가 무엇을 채택했는지 복원하기 어렵습니다.
 */
function assertFeatureSpecificRules(input: BuildProposalFeedbackPayloadInput): void {
  if (
    input.parsed_result.feature_type === 'merge_patch_draft' &&
    input.selection_status === 'edited' &&
    !input.final_code_ref
  ) {
    throw new Error(
      'merge_patch_draft feedback with selection_status=edited requires final_code_ref',
    );
  }
}

/**
 * parsed_ai_result와 사용자 최종 선택을 묶어 proposal_feedback_payload를 생성합니다.
 * UI/Core 구현이 아직 없더라도, 이 함수만으로 feedback 규칙을 mock 기반으로 검증할 수 있습니다.
 */
export function buildProposalFeedbackPayload(
  input: BuildProposalFeedbackPayloadInput,
): ProposalFeedback {
  assertFeatureSpecificRules(input);

  const payload: ProposalFeedback = {
    feedback_id: input.feedback_id ?? generateFeedbackId(),
    proposal_id: input.parsed_result.proposal_id,
    merge_proposal_id: resolveMergeProposalId(input.parsed_result),
    session_id: input.parsed_result.session_id,
    selection_status: input.selection_status,
    final_text: resolveFinalText(input),
    final_code_ref: input.final_code_ref,
    final_explanation: resolveFinalExplanation(input),
    quality_tag: input.quality_tag,
    feedback_note: input.feedback_note,
    decided_at: input.decided_at ?? new Date().toISOString(),
  };

  return ProposalFeedbackSchema.parse(payload);
}

/**
 * 저장소 계약은 project_id를 함께 요구하므로, proposal_feedback_payload를
 * repository insert용 입력으로 바꾸는 얇은 어댑터를 따로 둡니다.
 */
export function toCreateProposalFeedbackInput(
  projectId: string,
  feedback: ProposalFeedback,
): CreateProposalFeedbackInput {
  return {
    project_id: projectId,
    proposal_id: feedback.proposal_id,
    merge_proposal_id: feedback.merge_proposal_id ?? null,
    selection_status: feedback.selection_status,
    final_text: feedback.final_text ?? null,
    final_code_ref: feedback.final_code_ref ?? null,
    final_explanation: feedback.final_explanation ?? null,
    quality_tag: feedback.quality_tag,
    feedback_note: feedback.feedback_note ?? null,
  };
}
