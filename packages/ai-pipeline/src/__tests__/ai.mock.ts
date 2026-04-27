import { 
  AiInputPayload, 
  AiInputPayloadSchema, 
  ParsedAiResultSchema,
  ProposalFeedbackSchema,
  ProposalFeedback,
  ParsedAiResult,
} from '@gitcat/shared-types';
import { MergeAiService } from '../merge-proposal/MergeAiService';
import { MergeResultParser } from '../parser/MergeResultParser';
import { invalidInputMocks, invalidResponseMocks } from './invalidMocks';

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
    diff_patch_ref: "patch://local/aip_20260427_001/merge.patch",
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
];

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

function testParser() {
  console.log("\n--- [STEP 2] 파서 단독 검증 시작 ---");
  console.log("목표: LLM 응답(JSON)을 ParsedAiResultSchema에 맞게 정규화하는지 확인");

  const parser = new MergeResultParser();
  const sessionId = "test-session";

  invalidResponseMocks.forEach(mock => {
    try {
      parser.parse(mock.rawResponse, mock.featureType as any, sessionId);
      console.log(`[FAIL] ${mock.name}: 에러가 발생해야 하는데 통과됨`);
    } catch (err: any) {
      const firstError = err.errors?.[0];
      console.log(`[PASS] ${mock.name}: 의도된 에러 발생`);
      console.log(`      - 감지된 필드: ${firstError?.path?.join('.') || "unknown"}`);
      console.log(`      - 에러 메시지: ${firstError?.message || "Parsing Error"}`);
    }
  });
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

async function testFullServiceFlow() {
  console.log("\n--- [STEP 4] 서비스 전체 흐름 검증 시작 ---");
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
      const result = await service.processMergeRequest(payload);
      
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
  testParser();
  testDocumentedMocks();
  await testFullServiceFlow();

  console.log("\n" + "=".repeat(50));
  console.log("   모든 검증 절차가 완료되었습니다.");
  console.log("=".repeat(50) + "\n");
}
