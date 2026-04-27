import {
  DatasetType,
  MergeProposalStatus,
  ParsedAiResult,
  ProposalFeedback,
  QualityTag,
  SelectionStatus,
  TrainingCandidatePayload,
} from '@gitcat/shared-types';
import type { CreateProposalFeedbackInput } from '@gitcat/shared-types';
import {
  BuildProposalFeedbackPayloadInput,
  buildProposalFeedbackPayload,
  toCreateProposalFeedbackInput,
} from './proposal-feedback';
import {
  normalizeProposalStatusForSelection,
  selectionStatusToLifecycleEvent,
  transitionProposalStatus,
} from './proposal-lifecycle';
import { buildTrainingCandidatePayload } from './training-candidate';

export interface TrainingCandidatePlanInput {
  dataset_type: DatasetType;
  prompt_ref?: string;
  chosen_ref?: string;
  rejected_ref?: string;
  training_candidate_id?: string;
  is_approved?: boolean;
  is_exported?: boolean;
}

export interface BuildFeedbackPersistencePlanInput {
  project_id: string;
  parsed_result: ParsedAiResult;
  selection_status: SelectionStatus;
  quality_tag?: QualityTag;
  feedback_note?: string;
  final_text?: string;
  final_code_ref?: string;
  final_explanation?: string;
  feedback_id?: string;
  decided_at?: string;
  training_candidate?: TrainingCandidatePlanInput;
}

export interface FeedbackPersistencePlan {
  proposal_feedback_payload: ProposalFeedback;
  proposal_feedback_input: CreateProposalFeedbackInput;
  next_proposal_status: MergeProposalStatus;
  training_candidate_payload?: TrainingCandidatePayload;
}

/**
 * feedback 저장 직전까지 필요한 산출물을 한 번에 묶어 반환합니다.
 * Core 담당이 실제 repository/service wiring을 할 때는 이 결과를 받아
 * saveProposalFeedback + markProposalStatus + 선택적 training 후보 저장으로 연결하면 됩니다.
 */
export function buildFeedbackPersistencePlan(
  input: BuildFeedbackPersistencePlanInput,
): FeedbackPersistencePlan {
  const feedbackInput: BuildProposalFeedbackPayloadInput = {
    parsed_result: input.parsed_result,
    selection_status: input.selection_status,
    quality_tag: input.quality_tag,
    feedback_note: input.feedback_note,
    final_text: input.final_text,
    final_code_ref: input.final_code_ref,
    final_explanation: input.final_explanation,
    feedback_id: input.feedback_id,
    decided_at: input.decided_at,
  };

  const proposalFeedback = buildProposalFeedbackPayload(feedbackInput);
  const proposalFeedbackInput = toCreateProposalFeedbackInput(
    input.project_id,
    proposalFeedback,
  );
  const selectionReadyStatus = normalizeProposalStatusForSelection(
    input.parsed_result.proposal_status,
  );
  const nextProposalStatus = transitionProposalStatus(
    selectionReadyStatus,
    selectionStatusToLifecycleEvent(input.selection_status),
  );

  const trainingCandidatePayload = input.training_candidate
    ? buildTrainingCandidatePayload({
        parsed_result: input.parsed_result,
        feedback: proposalFeedback,
        ...input.training_candidate,
      })
    : undefined;

  return {
    proposal_feedback_payload: proposalFeedback,
    proposal_feedback_input: proposalFeedbackInput,
    next_proposal_status: nextProposalStatus,
    training_candidate_payload: trainingCandidatePayload,
  };
}
