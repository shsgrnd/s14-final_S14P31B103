// ==========================================
// 입력 스키마 위반 mock (STEP 1 검증용)
// AiInputPayloadSchema가 잘못된 입력을 거부하는지 확인합니다.
// ==========================================
export const invalidInputMocks = [
  {
    // target_branch가 빠진 merge_patch_draft 요청 — 필수 필드 누락 케이스
    name: "merge_patch_draft - target_branch 누락",
    payload: {
      project_id: "proj_123",
      session_id: "sess_123",
      feature_type: "merge_patch_draft",
      current_branch: "feat",
      // target_branch missing
      workspace_summary: "test",
      related_files: ["a.ts"],
      conflict_candidates: [],
      working_tree_diff_ref: "diff",
      schema_version: "1.0"
    }
  },
  {
    // recommendation_type이 빠진 recommendation 요청 — 조건부 필수 필드 누락 케이스
    name: "recommendation - recommendation_type 누락",
    payload: {
      project_id: "proj_123",
      session_id: "sess_123",
      feature_type: "recommendation",
      current_branch: "feat",
      change_summary: "test",
      changed_files: ["a.ts"],
      work_intent: "test",
      schema_version: "1.0"
      // recommendation_type missing
    }
  }
];

// ==========================================
// LLM 응답 파싱 위반 mock (STEP 2 검증용)
// MergeResultParser가 잘못된 rawResponse를 거부하는지 확인합니다.
// ==========================================
export const invalidResponseMocks = [
  {
    // 필수 필드(summary, applied_files 등)가 빠진 merge_patch_draft 응답
    name: "merge_patch_draft - 필수 필드 누락",
    featureType: "merge_patch_draft",
    rawResponse: JSON.stringify({
      title: "Missing fields"
      // summary, applied_files etc missing
    })
  }
];

// ==========================================
// feedback 생성 규칙 위반 mock (STEP 11 검증용)
// buildProposalFeedbackPayload의 비즈니스 규칙 위반을 즉시 감지하는지 확인합니다.
// ==========================================
export const invalidFeedbackBuilderMocks = [
  {
    // edited 상태에서 final_code_ref가 없으면 안 됨 — 문서 규칙: merge_patch_draft + edited -> final_code_ref 필수
    name: "merge_patch_draft edited - final_code_ref 누락",
    input: {
      selection_status: "edited",
      final_explanation: "설명만 있고 최종 코드 ref가 없음",
    },
  },
];

// ==========================================
// training candidate 생성 규칙 위반 mock (STEP 11 검증용)
// buildTrainingCandidatePayload의 dataset_type별 필수 ref 규칙을 확인합니다.
//
// [변경 이력]
// 2026-04-29 Task 24: merge_mediation source_type 포함 확정으로
//   "merge_mediation - source_type 미정" 케이스를 실패 mock에서 제거함.
// ==========================================
export const invalidTrainingCandidateBuilderMocks = [
  {
    // dpo 타입은 비교 학습용이므로 rejected_ref가 반드시 있어야 함
    name: "dpo - rejected_ref 누락",
    input: {
      dataset_type: "dpo",
      prompt_ref: "prompt://local/air_invalid/request.txt",
      chosen_ref: "chosen://local/tc_invalid.json",
    },
  },
];
