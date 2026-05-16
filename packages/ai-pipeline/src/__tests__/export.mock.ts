import { join } from 'path';
import { exportTrainingCandidatesToJsonl } from '../export/export-pipeline';
import { buildTrainingCandidatePayload } from '../feedback/training-candidate';
import { materializeTrainingCandidateArtifacts } from '../artifacts/training-candidate-artifacts';
import { mockParsedAiResults } from './ai.mock';
import { buildProposalFeedbackPayload } from '../feedback/proposal-feedback';

export async function runExportMockValidation() {
  console.log('\n--- Export 파이프라인 Mock 검증 시작 ---');
  const workspaceRoot = join(__dirname, '../../../../'); // s14-final_S14P31B103

  // 1. 더미 데이터 생성 (SFT용 merge_patch_draft, DPO용 conflict_explanation)
  const parsedMerge = mockParsedAiResults[0];
  const feedbackMerge = buildProposalFeedbackPayload({
    parsed_result: parsedMerge,
    selection_status: 'accepted',
    feedback_id: 'fb_export_001',
    decided_at: new Date().toISOString(),
  });

  const parsedConflict = mockParsedAiResults[1];
  const feedbackConflict = buildProposalFeedbackPayload({
    parsed_result: parsedConflict,
    selection_status: 'rejected',
    feedback_id: 'fb_export_002',
    decided_at: new Date().toISOString(),
  });

  // 2. 디스크에 Artifact 쓰기
  console.log('1) 학습 후보 Artifact를 로컬 파일시스템에 저장합니다...');
  
  const tcMergeId = 'tc_export_sft_001';
  const materializedMerge = await materializeTrainingCandidateArtifacts({
    workspaceRoot,
    parsedResult: parsedMerge,
    feedback: feedbackMerge,
    datasetType: 'sft',
    trainingCandidateId: tcMergeId,
    promptText: 'System: You are an AI assistant...\nUser: Return the final resolved code for the conflict.',
  });

  const candidateMerge = buildTrainingCandidatePayload({
    parsed_result: parsedMerge,
    feedback: feedbackMerge,
    dataset_type: 'sft',
    training_candidate_id: tcMergeId,
    prompt_ref: materializedMerge.prompt_ref,
    chosen_ref: materializedMerge.chosen_ref,
  });

  const tcConflictId = 'tc_export_dpo_001';
  const materializedConflict = await materializeTrainingCandidateArtifacts({
    workspaceRoot,
    parsedResult: parsedConflict,
    feedback: feedbackConflict,
    datasetType: 'dpo',
    trainingCandidateId: tcConflictId,
    promptText: 'System: You are an AI assistant...\nUser: Explain this conflict.',
    rejectedReason: 'The explanation was confusing.',
  });

  const candidateConflict = buildTrainingCandidatePayload({
    parsed_result: parsedConflict,
    feedback: feedbackConflict,
    dataset_type: 'dpo',
    training_candidate_id: tcConflictId,
    prompt_ref: materializedConflict.prompt_ref,
    chosen_ref: materializedConflict.chosen_ref,
    rejected_ref: materializedConflict.rejected_ref,
  });

  // 3. Export 실행
  console.log('2) JSONL Export 파이프라인을 실행합니다...');
  const candidates = [candidateMerge, candidateConflict];
  
  try {
    const result = await exportTrainingCandidatesToJsonl(workspaceRoot, candidates);
    
    console.log(`[PASS] Export 처리 완료`);
    console.log(`      - 저장 경로: ${result.filePath}`);
    console.log(`      - SFT 처리 건수: ${result.sftCount}`);
    console.log(`      - DPO 처리 건수: ${result.dpoCount}`);
    console.log(`      - 총 처리 건수: ${result.processedCount}`);
  } catch (err) {
    console.error(`[FAIL] Export 중 에러 발생:`, err);
  }
}
