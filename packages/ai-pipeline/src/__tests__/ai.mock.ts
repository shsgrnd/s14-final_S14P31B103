import { 
  AiInputPayload, 
  AiInputPayloadSchema, 
  ParsedAiResultSchema 
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

async function testFullServiceFlow() {
  console.log("\n--- [STEP 3] 서비스 전체 흐름 검증 시작 ---");
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
  await testFullServiceFlow();

  console.log("\n" + "=".repeat(50));
  console.log("   모든 검증 절차가 완료되었습니다.");
  console.log("=".repeat(50) + "\n");
}
