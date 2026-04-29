import {
  DatasetType,
  ParsedAiResult,
  ProposalFeedback,
  SourceType,
  TrainingCandidatePayload,
  TrainingCandidatePayloadSchema,
} from '@gitcat/shared-types';

/**
 * buildTrainingCandidatePayload에 전달되는 입력 인터페이스입니다.
 * prompt_ref / chosen_ref / rejected_ref는 실제 로컬 파일 경로(ref 문자열)를
 * 호출자가 직접 넘기도록 설계되어 있습니다.
 * (이유: 파일 저장 규칙이 바뀌어도 이 인터페이스 자체는 영향을 받지 않도록 분리)
 */
export interface BuildTrainingCandidatePayloadInput {
  parsed_result: ParsedAiResult;          // AI 결과 원본 (feature_type, proposal_id 등 참조)
  feedback: ProposalFeedback;             // 사용자 피드백 (feedback_id 연결용)
  dataset_type: DatasetType;              // 'sft' | 'dpo' | 'eval'
  prompt_ref?: string;                    // 프롬프트 원문이 저장된 로컬 파일 ref
  chosen_ref?: string;                    // 선택된(채택) 결과가 저장된 로컬 파일 ref
  rejected_ref?: string;                  // 거절된 결과가 저장된 로컬 파일 ref (DPO 필수)
  training_candidate_id?: string;         // 지정하지 않으면 generateTrainingCandidateId()로 자동 생성
  is_approved?: boolean;                  // 학습 승인 여부 (기본값: false)
  is_exported?: boolean;                  // export 완료 여부 (기본값: false)
}

/**
 * training_candidate_payload 식별자를 생성합니다.
 * feedback/proposal과 같은 방식으로 로컬 MVP 문서의 ID 규칙을 따릅니다.
 */
export function generateTrainingCandidateId(now: Date = new Date()): string {
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `tc_${yyyymmdd}_${suffix}`;
}

/**
 * 현재 문서 기준 source_type은 4개가 공식화되어 있습니다.
 * merge_mediation은 사용자가 중재안을 채택/수정/거절하는 흐름이 있으므로
 * training candidate 자동 생성 대상에 포함합니다.
 */
function resolveSourceType(parsedResult: ParsedAiResult): SourceType {
  // feature_type -> source_type 매핑 규칙
  // merge_patch_draft : 병합 초안 생성 결과 → 'merge_proposal'
  // conflict_explanation : 충돌 원인 설명 결과 → 'conflict_explanation'
  // recommendation : 커밋/브랜치명 등 추천 결과 → 'recommendation'
  // merge_mediation : 병합 중재안 결과 → 'merge_mediation'
  //   (2026-04-29 Task 24: 사용자 채택/수정/거절 흐름이 존재하므로 자동 후보화 대상에 포함 확정)
  switch (parsedResult.feature_type) {
    case 'merge_patch_draft':
      return 'merge_proposal';
    case 'conflict_explanation':
      return 'conflict_explanation';
    case 'recommendation':
      return 'recommendation';
    case 'merge_mediation':
      return 'merge_mediation';
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
    // ID가 없으면 'tc_YYYYMMDD_NNN' 형식으로 자동 생성
    training_candidate_id: input.training_candidate_id ?? generateTrainingCandidateId(),
    proposal_id: input.parsed_result.proposal_id,
    feedback_id: input.feedback.feedback_id,
    dataset_type: input.dataset_type,
    // feature_type → source_type 변환은 resolveSourceType에서 일관되게 처리
    source_type: resolveSourceType(input.parsed_result),
    prompt_ref: input.prompt_ref,
    chosen_ref: input.chosen_ref,
    rejected_ref: input.rejected_ref,
    // 승인/export는 초기값 false로 고정 — 이후 별도 플로우에서 갱신
    is_approved: input.is_approved ?? false,
    is_exported: input.is_exported ?? false,
  };

  // Zod 스키마로 최종 검증 (dpo일 때 rejected_ref 필수 등 규칙 포함)
  return TrainingCandidatePayloadSchema.parse(payload);
}
