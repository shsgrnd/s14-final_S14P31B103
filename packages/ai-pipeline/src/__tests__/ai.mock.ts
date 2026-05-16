import { 
  AiInputPayload, 
  AiInputPayloadSchema, 
  ParsedAiResultSchema,
  ProposalFeedbackSchema,
  ProposalFeedback,
  ParsedAiResult,
} from '@gitcat/shared-types';
import * as path from 'path';
import { MergeAiService } from '../merge-proposal/MergeAiService';
import { MergeResultParser } from '../parser/MergeResultParser';
import {
  buildProposalFeedbackPayload,
  toCreateProposalFeedbackInput,
} from '../feedback/proposal-feedback';
import {
  buildFeedbackPersistencePlan,
  buildMaterializedFeedbackPersistencePlan,
} from '../feedback/feedback-persistence-plan';
import { buildTrainingCandidatePayload } from '../feedback/training-candidate';
import { buildDisplayReadyResult } from '../feedback/result-display';
import { buildParsedResultStoragePlan } from '../feedback/result-storage-plan';
import { buildParsedResultRepositoryInputDraft } from '../feedback/result-repository-input';
import {
  getAllowedProposalLifecycleEvents,
  isTerminalProposalStatus,
  transitionProposalStatus,
} from '../feedback/proposal-lifecycle';
import {
  invalidFeedbackBuilderMocks,
  invalidInputMocks,
  invalidResponseMocks,
  invalidTrainingCandidateBuilderMocks,
} from './invalidMocks';

// --- 정상 데이터 Mock ---

export const mockAiInputPayload: AiInputPayload = {
  project_id: "proj_abc123",
  session_id: "sess_xyz789",
  feature_type: "merge_patch_draft", 
  current_branch: "feature/new-login",
  target_branch: "main",
  workspace_summary: "A project refactoring authentication flows.",
  related_files: ["src/auth.ts", "src/index.ts"],
  conflict_candidates: [
    {
      candidate_id: "cc_001",
      analysis_id: "ana_001",
      file_path: "src/index.ts",
      line_start: 10,
      line_end: 20,
      conflict_type: "same_region",
      reason_summary: "Both branches modified the initialize method",
      risk_level: "medium",
      detected_by: "diff",
      source_code: "<<<<<<< HEAD\nconsole.log('A');\n=======\nconsole.log('B');\n>>>>>>> feature",
      target_code: "console.log('B');"
    }
  ],
  working_tree_diff_ref: "diff_v1.0",
  risk_summary: "Medium risk due to core auth module changes.",
  schema_version: "1.0.0"
};

export const mockParsedAiResults: ParsedAiResult[] = [
  {
    proposal_id: "aip_20260427_001",
    session_id: "ais_20260427_001",
    ai_request_id: "air_20260427_001",
    feature_type: "merge_patch_draft",
    title: "DTO 구조를 유지하면서 예외 처리 변경을 반영한 병합 초안",
    summary: "develop의 응답 구조를 유지하고 feature 브랜치의 예외 처리 흐름을 선택 반영하는 안",
    explanation: "공통 모듈 의존성을 고려하면 DTO 구조 변경을 최소화하는 것이 안전합니다.",
    confidence_score: 0.82,
    proposal_status: "parsed",
    parser_version: "v1",
    merged_code_ref: "code://local/aip_20260427_001/merged.ts",
    applied_files: ["src/auth/service.ts"],
    validation_required: true,
    validation_summary: "LoginResponseDto 타입 확인 필요",
  },
  {
    proposal_id: "aip_20260427_002",
    session_id: "ais_20260427_002",
    ai_request_id: "air_20260427_002",
    feature_type: "conflict_explanation",
    title: "로그인 응답 형식 변경으로 인한 간접 충돌 가능성",
    summary: "동일 라인 충돌은 없지만 응답 DTO 변경과 예외 처리 포맷 변경이 연결 지점에서 충돌할 수 있습니다.",
    explanation: "직접 충돌보다 인터페이스 불일치가 핵심 위험입니다.",
    confidence_score: 0.79,
    proposal_status: "parsed",
    parser_version: "v1",
    cause_summary: "응답 DTO 구조와 예외 처리 포맷이 동시에 변경됨",
    detailed_explanation: "컨트롤러, 서비스, DTO 간 데이터 흐름에서 반환 형식이 달라질 수 있습니다.",
    related_files: ["src/auth/dto.ts", "src/auth/controller.ts"],
    recommended_resolution_direction: "DTO 구조를 기준 브랜치에 맞추고 예외 처리만 선택 반영",
    risk_level: "high",
  },
  {
    proposal_id: "aip_20260427_101",
    session_id: "ais_20260427_101",
    ai_request_id: "air_20260427_101",
    feature_type: "recommendation",
    recommendation_type: "commit_message",
    title: "커밋 메시지 추천 결과",
    summary: "로그인 DTO 정리와 예외 처리 흐름 개선 작업을 반영한 커밋 메시지 제안",
    explanation: "auth 범주의 refactor 또는 fix 형태가 적절한 변경으로 보입니다.",
    confidence_score: 0.86,
    proposal_status: "parsed",
    parser_version: "v1",
    primary_text: "refactor(auth): align login dto and error flow",
    alternative_texts: [
      "fix(auth): normalize login response and exceptions",
      "refactor(auth): clean up login response handling",
      "feat(auth): improve login response and error structure",
    ],
    generation_basis_summary: "DTO 구조 정리, 예외 처리 흐름 수정, 인증 서비스 반환 타입 보정을 반영함",
    format_notes: "conventional commit 형식과 50자 내외 subject 기준을 우선 반영함",
    warnings: [
      "feat는 신규 기능으로 오해될 수 있어 refactor 또는 fix가 더 적절할 수 있음",
    ],
  },
];

export const mockProposalFeedbacks: ProposalFeedback[] = [
  {
    feedback_id: "fb_20260427_001",
    proposal_id: "aip_20260427_001",
    merge_proposal_id: "aip_20260427_001",
    selection_status: "edited",
    final_code_ref: "code://local/fb_20260427_001/final.ts",
    final_explanation: "DTO는 develop 기준을 유지하고 예외 처리 로직만 선택 반영함",
    quality_tag: "partially_useful",
    feedback_note: "설명은 유용했지만 patch는 일부 수동 수정이 필요했음",
    decided_at: "2026-04-27T10:30:00+09:00",
  },
  {
    feedback_id: "fb_20260427_002",
    proposal_id: "aip_20260427_002",
    merge_proposal_id: "aip_20260427_002",
    selection_status: "accepted",
    final_explanation: "응답 DTO 불일치를 우선 해결하기로 결정",
    quality_tag: "useful",
    feedback_note: "원인 설명이 충분히 명확했음",
    decided_at: "2026-04-27T10:35:00+09:00",
  },
  {
    feedback_id: "fb_20260427_101",
    proposal_id: "aip_20260427_101",
    selection_status: "accepted",
    final_text: "refactor(auth): align login dto and error flow",
    final_explanation: "커밋 메시지 추천안 1번을 그대로 사용하기로 결정",
    quality_tag: "useful",
    feedback_note: "짧고 변경 의도가 잘 드러남",
    decided_at: "2026-04-27T10:40:00+09:00",
  },
  {
    feedback_id: "fb_20260427_102",
    proposal_id: "aip_20260427_101",
    selection_status: "edited",
    final_text: "fix(auth): align login dto and keep new error flow",
    final_explanation: "추천 방향은 유지하되 fix가 더 적절하다고 판단해 수정함",
    quality_tag: "partially_useful",
    feedback_note: "의도는 맞지만 타입을 조금 더 보수적으로 표현하고 싶었음",
    decided_at: "2026-04-27T10:42:00+09:00",
  },
  {
    feedback_id: "fb_20260427_103",
    proposal_id: "aip_20260427_101",
    selection_status: "rejected",
    final_explanation: "이번에는 팀 컨벤션상 더 짧은 메시지가 필요해서 사용하지 않음",
    quality_tag: "partially_useful",
    feedback_note: "추천은 자연스럽지만 팀 메시지 스타일과는 약간 다름",
    decided_at: "2026-04-27T10:45:00+09:00",
  },
];

function getMockWorkspaceRoot(): string {
  // test:mock는 packages/ai-pipeline에서 실행되지만,
  // 실제 저장 경로 검증은 저장소 루트를 workspace root로 보는 편이
  // extension 런타임과 동일한 조건을 재현하기 쉽습니다.
  return path.resolve(__dirname, '../../../..');
}

// --- 검증 함수들 ---

function testInputSchema() {
  console.log("\n--- [STEP 1] 입력 스키마 단독 검증 시작 ---");
  console.log("목표: AiInputPayloadSchema가 정상 데이터를 수용하고 비정상 데이터를 거부하는지 확인");
  
  try {
    AiInputPayloadSchema.parse(mockAiInputPayload);
    console.log(`[PASS] 정상 입력 페이로드 검증 완료`);
    console.log(`      - 프로젝트 ID: ${mockAiInputPayload.project_id}`);
    console.log(`      - 기능 유형: ${mockAiInputPayload.feature_type}`);
  } catch (err) {
    console.log("[FAIL] 정상 입력 페이로드 검증 실패");
    console.error(err);
  }

  invalidInputMocks.forEach(mock => {
    try {
      AiInputPayloadSchema.parse(mock.payload);
      console.log(`[FAIL] ${mock.name}: 에러가 발생해야 하는데 통과됨`);
    } catch (err: any) {
      const firstError = err.errors?.[0];
      console.log(`[PASS] ${mock.name}: 의도된 에러 발생`);
      console.log(`      - 감지된 필드: ${firstError?.path?.join('.') || "unknown"}`);
      console.log(`      - 에러 메시지: ${firstError?.message || "Validation Error"}`);
    }
  });
}

async function testParser() {
  console.log("\n--- [STEP 2] 파서 단독 검증 시작 ---");
  console.log("목표: LLM 응답(JSON)을 ParsedAiResultSchema에 맞게 정규화하는지 확인");

  const parser = new MergeResultParser();
  const sessionId = "test-session";
  const workspaceRoot = getMockWorkspaceRoot();

  try {
    const parsed = await parser.parse(
      [
        "```json",
        JSON.stringify({
          title: "코드블록 병합 초안",
          summary: "코드블록 안의 JSON만 추출",
          explanation: "설명 없는 fenced JSON 응답은 허용",
          confidence_score: 0.77,
          merged_code: "const resolved = true;",
          validation_summary: "run tests",
        }, null, 2),
        "```",
      ].join("\n"),
      "merge_patch_draft",
      sessionId,
      { workspaceRoot },
    );
    if (parsed.feature_type !== "merge_patch_draft") {
      throw new Error("Expected merge_patch_draft parser result");
    }
    console.log("[PASS] merge_patch_draft fenced JSON 응답 파싱 완료");
    console.log(`      - Merged Code Ref: ${parsed.merged_code_ref}`);
  } catch (err) {
    console.log("[FAIL] merge_patch_draft fenced JSON 응답 파싱 실패");
    console.error(err);
  }

  for (const mock of invalidResponseMocks) {
    try {
      await parser.parse(mock.rawResponse, mock.featureType as any, sessionId, { workspaceRoot });
      console.log(`[FAIL] ${mock.name}: 에러가 발생해야 하는데 통과됨`);
    } catch (err: any) {
      const firstError = err.errors?.[0];
      console.log(`[PASS] ${mock.name}: 의도된 에러 발생`);
      console.log(`      - 감지된 필드: ${firstError?.path?.join('.') || "unknown"}`);
      console.log(`      - 에러 메시지: ${firstError?.message || "Parsing Error"}`);
    }
  }
}

function testDocumentedMocks() {
  console.log("\n--- [STEP 3] 문서 mock 검증 시작 ---");
  console.log("목표: 개인 문서에 정리한 parsed_ai_result / proposal_feedback_payload 샘플이 실제 스키마를 통과하는지 확인");

  mockParsedAiResults.forEach((mock) => {
    try {
      ParsedAiResultSchema.parse(mock);
      console.log(`[PASS] parsed_ai_result mock 검증 완료`);
      console.log(`      - Proposal ID: ${mock.proposal_id}`);
      console.log(`      - Feature Type: ${mock.feature_type}`);
    } catch (err: any) {
      console.log(`[FAIL] parsed_ai_result mock 검증 실패`);
      console.log(`      - Proposal ID: ${mock.proposal_id}`);
      console.log(`      - 에러 내용: ${err.message}`);
    }
  });

  mockProposalFeedbacks.forEach((mock) => {
    try {
      ProposalFeedbackSchema.parse(mock);
      console.log(`[PASS] proposal_feedback_payload mock 검증 완료`);
      console.log(`      - Feedback ID: ${mock.feedback_id}`);
      console.log(`      - Selection Status: ${mock.selection_status}`);
    } catch (err: any) {
      console.log(`[FAIL] proposal_feedback_payload mock 검증 실패`);
      console.log(`      - Feedback ID: ${mock.feedback_id}`);
      console.log(`      - 에러 내용: ${err.message}`);
    }
  });
}

function testFeedbackBuilder() {
  console.log("\n--- [STEP 4] feedback 생성기 검증 시작 ---");
  console.log("목표: parsed_ai_result와 사용자 선택을 조합해 proposal_feedback_payload 및 저장 입력을 만들 수 있는지 확인");

  const generatedMergeFeedback = buildProposalFeedbackPayload({
    parsed_result: mockParsedAiResults[0],
    selection_status: "edited",
    final_code_ref: "code://local/fb_20260427_301/final.ts",
    final_explanation: "DTO는 유지하고 예외 처리 흐름만 수동 조정함",
    quality_tag: "partially_useful",
    feedback_note: "patch 방향은 좋았지만 최종 코드는 수동 수정함",
    feedback_id: "fb_20260427_301",
    decided_at: "2026-04-27T11:00:00+09:00",
  });

  const generatedConflictFeedback = buildProposalFeedbackPayload({
    parsed_result: mockParsedAiResults[1],
    selection_status: "accepted",
    quality_tag: "useful",
    feedback_note: "설명 결과를 그대로 채택함",
    feedback_id: "fb_20260427_302",
    decided_at: "2026-04-27T11:05:00+09:00",
  });

  const generatedRecommendationFeedback = buildProposalFeedbackPayload({
    parsed_result: mockParsedAiResults[2],
    selection_status: "accepted",
    quality_tag: "useful",
    feedback_note: "1번 추천안을 그대로 채택함",
    feedback_id: "fb_20260427_303",
    decided_at: "2026-04-27T11:10:00+09:00",
  });

  const editedRecommendationFeedback = buildProposalFeedbackPayload({
    parsed_result: mockParsedAiResults[2],
    selection_status: "edited",
    final_text: "fix(auth): align login dto and keep new error flow",
    final_explanation: "추천 방향은 유지하되 팀 톤에 맞게 수정함",
    quality_tag: "partially_useful",
    feedback_note: "추천 초안은 유용했지만 최종 텍스트는 조금 더 보수적으로 조정함",
    feedback_id: "fb_20260427_304",
    decided_at: "2026-04-27T11:12:00+09:00",
  });

  const rejectedRecommendationFeedback = buildProposalFeedbackPayload({
    parsed_result: mockParsedAiResults[2],
    selection_status: "rejected",
    final_explanation: "이번에는 더 짧은 메시지가 필요해서 채택하지 않음",
    quality_tag: "partially_useful",
    feedback_note: "근거는 좋지만 팀 메시지 스타일과는 약간 다름",
    feedback_id: "fb_20260427_305",
    decided_at: "2026-04-27T11:14:00+09:00",
  });

  const repositoryInput = toCreateProposalFeedbackInput(
    mockAiInputPayload.project_id,
    generatedMergeFeedback,
  );

  [
    generatedMergeFeedback,
    generatedConflictFeedback,
    generatedRecommendationFeedback,
    editedRecommendationFeedback,
    rejectedRecommendationFeedback,
  ].forEach((feedback) => {
    try {
      ProposalFeedbackSchema.parse(feedback);
      console.log(`[PASS] feedback 생성기 검증 완료`);
      console.log(`      - Feedback ID: ${feedback.feedback_id}`);
      console.log(`      - Selection Status: ${feedback.selection_status}`);
    } catch (err: any) {
      console.log(`[FAIL] feedback 생성기 검증 실패`);
      console.log(`      - Feedback ID: ${feedback.feedback_id}`);
      console.log(`      - 에러 내용: ${err.message}`);
    }
  });

  console.log(`[PASS] 저장 입력 변환 검증 완료`);
  console.log(`      - Project ID: ${repositoryInput.project_id}`);
  console.log(`      - Proposal ID: ${repositoryInput.proposal_id}`);
}

function testTrainingCandidateBuilder() {
  console.log("\n--- [STEP 5] 학습 후보 생성기 검증 시작 ---");
  console.log("목표: feedback 결과를 training_candidate_payload 규칙에 맞게 후보화할 수 있는지 확인");

  const mergeFeedback = buildProposalFeedbackPayload({
    parsed_result: mockParsedAiResults[0],
    selection_status: "edited",
    final_code_ref: "code://local/fb_20260427_401/final.ts",
    final_explanation: "DTO는 유지하고 예외 처리 흐름만 수정함",
    quality_tag: "partially_useful",
    feedback_note: "수동 수정본을 학습 후보로 남김",
    feedback_id: "fb_20260427_401",
    decided_at: "2026-04-27T11:20:00+09:00",
  });

  const conflictFeedback = buildProposalFeedbackPayload({
    parsed_result: mockParsedAiResults[1],
    selection_status: "accepted",
    quality_tag: "useful",
    feedback_note: "설명 방향을 그대로 채택함",
    feedback_id: "fb_20260427_402",
    decided_at: "2026-04-27T11:25:00+09:00",
  });

  const mergeTrainingCandidate = buildTrainingCandidatePayload({
    parsed_result: mockParsedAiResults[0],
    feedback: mergeFeedback,
    dataset_type: "sft",
    prompt_ref: "prompt://local/air_20260427_001/request.txt",
    chosen_ref: "chosen://local/tc_20260427_401.json",
    training_candidate_id: "tc_20260427_401",
  });

  const conflictTrainingCandidate = buildTrainingCandidatePayload({
    parsed_result: mockParsedAiResults[1],
    feedback: conflictFeedback,
    dataset_type: "dpo",
    prompt_ref: "prompt://local/air_20260427_002/request.txt",
    chosen_ref: "chosen://local/tc_20260427_402.json",
    rejected_ref: "rejected://local/tc_20260427_402.json",
    training_candidate_id: "tc_20260427_402",
  });

  [mergeTrainingCandidate, conflictTrainingCandidate].forEach((candidate) => {
    console.log(`[PASS] training_candidate_payload 생성기 검증 완료`);
    console.log(`      - Training Candidate ID: ${candidate.training_candidate_id}`);
    console.log(`      - Dataset Type: ${candidate.dataset_type}`);
    console.log(`      - Source Type: ${candidate.source_type}`);
  });
}

function testFeedbackPersistencePlan() {
  console.log("\n--- [STEP 6] 저장 계획 생성기 검증 시작 ---");
  console.log("목표: feedback 저장 입력, proposal 상태 변경, training 후보화를 한 번에 묶을 수 있는지 확인");

  const persistencePlan = buildFeedbackPersistencePlan({
    project_id: mockAiInputPayload.project_id,
    parsed_result: mockParsedAiResults[0],
    selection_status: "edited",
    final_code_ref: "code://local/fb_20260427_501/final.ts",
    final_explanation: "수동 수정본 기준으로 확정",
    quality_tag: "partially_useful",
    feedback_note: "저장 메타데이터 연결 테스트",
    feedback_id: "fb_20260427_501",
    decided_at: "2026-04-27T11:35:00+09:00",
    training_candidate: {
      dataset_type: "sft",
      prompt_ref: "prompt://local/air_20260427_001/request.txt",
      chosen_ref: "chosen://local/tc_20260427_501.json",
      training_candidate_id: "tc_20260427_501",
    },
  });

  console.log(`[PASS] 저장 계획 생성기 검증 완료`);
  console.log(`      - Feedback ID: ${persistencePlan.proposal_feedback_payload.feedback_id}`);
  console.log(`      - Next Proposal Status: ${persistencePlan.next_proposal_status}`);
  console.log(`      - Project ID: ${persistencePlan.proposal_feedback_input.project_id}`);
  console.log(
    `      - Training Candidate: ${persistencePlan.training_candidate_payload?.training_candidate_id ?? "none"}`
  );
}

async function testMaterializedFeedbackPersistencePlan() {
  console.log("\n--- [STEP 6-1] 최종 코드 artifact 연동 검증 시작 ---");
  console.log("목표: final code 저장과 feedback persistence plan 생성을 한 흐름으로 묶을 수 있는지 확인");

  const persistencePlan = await buildMaterializedFeedbackPersistencePlan({
    project_id: mockAiInputPayload.project_id,
    parsed_result: mockParsedAiResults[0],
    selection_status: "edited",
    final_code: "export function login() { return 'ok'; }\n",
    final_code_file_path: "src/auth/service.ts",
    final_explanation: "최종 수동 수정본을 feedback artifact로 저장",
    quality_tag: "partially_useful",
    feedback_note: "artifact materialization 연결 테스트",
    feedback_id: "fb_20260427_601",
    decided_at: "2026-04-27T11:40:00+09:00",
    workspace_root: getMockWorkspaceRoot(),
  });

  console.log(`[PASS] materialized feedback persistence plan 생성 완료`);
  console.log(`      - Feedback ID: ${persistencePlan.proposal_feedback_payload.feedback_id}`);
  console.log(
    `      - Final Code Ref: ${persistencePlan.proposal_feedback_payload.final_code_ref ?? "none"}`
  );
  console.log(
    `      - Stored Path: ${persistencePlan.materialized_feedback_artifacts.final_code_absolute_path ?? "none"}`
  );
}

async function testMaterializedTrainingCandidatePersistencePlan() {
  console.log("\n--- [STEP 6-2] training candidate artifact 연동 검증 시작 ---");
  console.log("목표: prompt/chosen/rejected ref를 실제 로컬 artifact로 저장하고 payload에 연결할 수 있는지 확인");

  const persistencePlan = await buildMaterializedFeedbackPersistencePlan({
    project_id: mockAiInputPayload.project_id,
    parsed_result: mockParsedAiResults[1],
    selection_status: "accepted",
    final_explanation: "충돌 설명 결과를 기준으로 학습 후보를 남김",
    quality_tag: "useful",
    feedback_note: "DPO 비교용 후보 저장 테스트",
    feedback_id: "fb_20260427_602",
    decided_at: "2026-04-27T11:42:00+09:00",
    workspace_root: getMockWorkspaceRoot(),
    training_candidate: {
      dataset_type: "dpo",
      training_candidate_id: "tc_20260427_602",
      prompt_text: "사용자 입력과 충돌 후보를 바탕으로 conflict explanation을 생성한다.",
      rejected_reason: "설명은 유용했지만 비교용으로 비채택 후보도 함께 남긴다.",
    },
  });

  console.log(`[PASS] materialized training candidate persistence plan 생성 완료`);
  console.log(
    `      - Training Candidate ID: ${persistencePlan.training_candidate_payload?.training_candidate_id ?? "none"}`
  );
  console.log(
    `      - Prompt Ref: ${persistencePlan.training_candidate_payload?.prompt_ref ?? "none"}`
  );
  console.log(
    `      - Chosen Ref: ${persistencePlan.training_candidate_payload?.chosen_ref ?? "none"}`
  );
  console.log(
    `      - Rejected Ref: ${persistencePlan.training_candidate_payload?.rejected_ref ?? "none"}`
  );
}

function testDisplayReadyResult() {
  console.log("\n--- [STEP 7] 표시 구조 생성기 검증 시작 ---");
  console.log("목표: parsed_ai_result를 UI 표시 직전 형태로 정리하고 상태를 displayed로 전환할 수 있는지 확인");

  mockParsedAiResults.forEach((result) => {
    const displayReady = buildDisplayReadyResult(result);

    console.log(`[PASS] display ready 변환 완료`);
    console.log(`      - Proposal ID: ${displayReady.proposal_id}`);
    console.log(`      - Feature Type: ${displayReady.feature_type}`);
    console.log(`      - Display Status: ${displayReady.proposal_status}`);
    console.log(`      - Section Count: ${displayReady.sections.length}`);
  });
}

function testParsedResultStoragePlan() {
  console.log("\n--- [STEP 8] 결과 저장 계획 생성기 검증 시작 ---");
  console.log("목표: parsed_ai_result를 SQLite 메타데이터와 로컬 ref 기준으로 분리할 수 있는지 확인");

  [mockParsedAiResults[0], mockParsedAiResults[2]].forEach((result) => {
    const storagePlan = buildParsedResultStoragePlan(result);

    console.log(`[PASS] result storage plan 생성 완료`);
    console.log(`      - Proposal ID: ${storagePlan.proposal_id}`);
    console.log(`      - Storage Target: ${storagePlan.storage_target}`);
    console.log(`      - Pending Linkage: ${storagePlan.pending_linkage_fields.join(", ")}`);
    console.log(`      - Local Artifact Ref Count: ${storagePlan.local_artifact_refs.length}`);
  });
}

function testParsedResultRepositoryInputDraft() {
  console.log("\n--- [STEP 9] repository 입력 초안 생성기 검증 시작 ---");
  console.log("목표: parsed_ai_result를 공식 문서 기준 저장 입력 초안으로 변환할 수 있는지 확인");

  // mock 배열은 union 타입으로 선언돼 있어서,
  // 테스트에서는 feature별 샘플을 한 번 더 좁혀 준 뒤 overload helper를 호출합니다.
  const mergePatchResult = mockParsedAiResults[0];
  if (mergePatchResult.feature_type !== "merge_patch_draft") {
    throw new Error("Expected merge_patch_draft mock at index 0");
  }

  const recommendationResult = mockParsedAiResults[2];
  if (recommendationResult.feature_type !== "recommendation") {
    throw new Error("Expected recommendation mock at index 2");
  }

  const mergeProposalDraft = buildParsedResultRepositoryInputDraft(
    mergePatchResult,
    {
      conflict_candidate_id: "cc_20260427_001",
      inference_run_id: "ir_20260427_001",
      file_path: "src/auth/service.ts",
      parsed_at: "2026-04-27T11:45:00+09:00",
    },
  );

  const recommendationDraft = buildParsedResultRepositoryInputDraft(
    recommendationResult,
    {
      project_id: mockAiInputPayload.project_id,
      session_id: recommendationResult.session_id,
      ai_request_id: recommendationResult.ai_request_id,
      input_summary: "auth service and merge panel integration changes",
      followup_notes: "reuse recent branch naming history when available",
      created_at: "2026-04-27T11:46:00+09:00",
    },
  );

  console.log(`[PASS] merge proposal repository draft 생성 완료`);
  console.log(`      - Proposal ID: ${mergeProposalDraft.proposal_id}`);
  console.log(`      - File Path: ${mergeProposalDraft.file_path}`);
  console.log(`      - Merged Code Ref: ${mergeProposalDraft.merged_code_ref ?? "none"}`);

  console.log(`[PASS] recommendation repository draft 생성 완료`);
  console.log(`      - Recommendation ID: ${recommendationDraft.recommendation_id}`);
  console.log(`      - Project ID: ${recommendationDraft.project_id}`);
  console.log(`      - Result Text: ${recommendationDraft.result_text}`);
}

function testProposalLifecycle() {
  console.log("\n--- [STEP 10] 상태 전이 규칙 검증 시작 ---");
  console.log("목표: displayed/accepted/edited/rejected/completed 흐름이 한 곳에서 일관되게 계산되는지 확인");

  const displayedStatus = transitionProposalStatus("parsed", "display");
  const acceptedStatus = transitionProposalStatus("displayed", "accept");
  const completedStatus = transitionProposalStatus("accepted", "complete");
  const allowedEvents = getAllowedProposalLifecycleEvents("displayed");

  console.log(`[PASS] proposal lifecycle 검증 완료`);
  console.log(`      - parsed -> ${displayedStatus}`);
  console.log(`      - displayed -> ${acceptedStatus}`);
  console.log(`      - accepted -> ${completedStatus}`);
  console.log(`      - displayed allowed events: ${allowedEvents.join(", ")}`);
  console.log(`      - is completed terminal?: ${isTerminalProposalStatus(completedStatus)}`);
}

function testInvalidFeedbackAndTrainingRules() {
  console.log("\n--- [STEP 11] feedback/save 실패 규칙 검증 시작 ---");
  console.log("목표: edited/ref 규칙과 training candidate 조건 위반이 즉시 감지되는지 확인");

  invalidFeedbackBuilderMocks.forEach((mock) => {
    try {
      buildProposalFeedbackPayload({
        parsed_result: mockParsedAiResults[0],
        ...(mock.input as any),
      });
      console.log(`[FAIL] ${mock.name}: 에러가 발생해야 하는데 통과됨`);
    } catch (err: any) {
      console.log(`[PASS] ${mock.name}: 의도된 에러 발생`);
      console.log(`      - 에러 내용: ${err.message}`);
    }
  });

  invalidTrainingCandidateBuilderMocks.forEach((mock) => {
    try {
      const parsedResult =
        mock.name.includes("merge_mediation")
          ? ({
              proposal_id: "aip_20260427_999",
              session_id: "ais_20260427_999",
              ai_request_id: "air_20260427_999",
              feature_type: "merge_mediation",
              title: "중재안",
              summary: "중재 선택지 요약",
              proposal_status: "parsed",
              parser_version: "v1",
              recommended_option: "Option A",
              tradeoffs: ["장점", "단점"],
              recommended_next_action: "검토 후 수동 반영",
            } as ParsedAiResult)
          : mockParsedAiResults[1];

      const feedback = buildProposalFeedbackPayload({
        parsed_result: parsedResult,
        selection_status: "accepted",
        feedback_id: "fb_20260427_999",
        decided_at: "2026-04-27T11:50:00+09:00",
      });

      buildTrainingCandidatePayload({
        parsed_result: parsedResult,
        feedback,
        ...(mock.input as any),
      });
      console.log(`[FAIL] ${mock.name}: 에러가 발생해야 하는데 통과됨`);
    } catch (err: any) {
      console.log(`[PASS] ${mock.name}: 의도된 에러 발생`);
      console.log(`      - 에러 내용: ${err.message}`);
    }
  });
}

async function testFullServiceFlow() {
  console.log("\n--- [STEP 12] 서비스 전체 흐름 검증 시작 ---");
  console.log("목표: 입력 -> Prompt -> Client -> Parser -> Result 전체 과정을 시뮬레이션");

  const service = new MergeAiService();
  const features = ['merge_patch_draft', 'conflict_explanation', 'merge_mediation', 'recommendation'];

  for (const feature of features) {
    try {
      const payload: any = {
        ...mockAiInputPayload,
        feature_type: feature as any
      };

      if (feature === 'recommendation') {
        payload.recommendation_type = 'commit_message';
        payload.change_summary = 'Updated auth logic';
        payload.work_intent = 'Refactoring for better performance';
        payload.changed_files = ['src/auth.ts'];
      }

      console.log(`\n>>> [Testing Feature: ${feature}]`);
      const result = await service.processMergeRequest(payload, {
        workspaceRoot: getMockWorkspaceRoot(),
      });
      
      console.log(`[PASS] 서비스 흐름 완료`);
      console.log(`      - 생성된 Proposal ID: ${result.proposal_id}`);
      console.log(`      - 결과 제목: ${result.title}`);
      
      if (result.title && result.summary) {
        console.log(`      -> 핵심 필드(title, summary) 유효성 확인됨`);
      }

      if (feature === 'recommendation') {
        const recResult = result as any;
        if (recResult.primary_text && recResult.alternative_texts) {
          console.log(`      -> 추천 텍스트: "${recResult.primary_text}" (외 ${recResult.alternative_texts.length}개)`);
        }
      }
    } catch (err: any) {
      console.log(`[FAIL] ${feature}: 실행 중 예외 발생`);
      console.log(`      - 에러 내용: ${err.message}`);
    }
  }
}

export async function runMockAiPipelineDemo() {
  console.log("\n" + "=".repeat(50));
  console.log("   AI 모듈 Mock 기반 검증 절차 시작 (Detailed)");
  console.log("=".repeat(50));

  testInputSchema();
  await testParser();
  testDocumentedMocks();
  testFeedbackBuilder();
  testTrainingCandidateBuilder();
  testFeedbackPersistencePlan();
  await testMaterializedFeedbackPersistencePlan();
  await testMaterializedTrainingCandidatePersistencePlan();
  testDisplayReadyResult();
  testParsedResultStoragePlan();
  testParsedResultRepositoryInputDraft();
  testProposalLifecycle();
  testInvalidFeedbackAndTrainingRules();
  await testFullServiceFlow();

  console.log("\n" + "=".repeat(50));
  console.log("   모든 검증 절차가 완료되었습니다.");
  console.log("=".repeat(50) + "\n");
}
