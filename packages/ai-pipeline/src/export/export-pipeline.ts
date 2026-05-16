import * as fs from 'fs/promises';
import * as path from 'path';
import { TrainingCandidatePayload } from '@gitcat/shared-types';
import {
  resolveTrainingCandidateArtifactPath,
  resolveProposalArtifactPath,
  resolveFinalCodeArtifactPath,
} from '@gitcat/storage';

export interface ExportResult {
  filePath: string;
  processedCount: number;
  sftCount: number;
  dpoCount: number;
}

const SYSTEM_METADATA_FIELDS = [
  'proposal_id',
  'session_id',
  'ai_request_id',
  'proposal_status',
  'parser_version',
  'confidence_score',
  'feedback_id',
  'selection_status',
  'quality_tag',
  'feedback_note',
  'rejected_reason', // 정책에 따라 모델이 직접 생성한 출력 본문만 남기기 위해 제외
];

/**
 * 객체에서 시스템 메타데이터 필드를 제외하고 순수 AI 학습 타깃(Output)만 남깁니다.
 */
function filterSystemMetadata(payload: Record<string, any>): Record<string, any> {
  const filtered = { ...payload };
  for (const field of SYSTEM_METADATA_FIELDS) {
    delete filtered[field];
  }
  return filtered;
}

/**
 * 인라인 치환이 필요한 파일 ref(merged_code_ref, final_code_ref 등)가 있다면
 * 실제 로컬 파일을 읽어서 문자열로 교체합니다.
 */
async function inlineArtifactRefs(
  workspaceRoot: string,
  payload: Record<string, any>,
): Promise<Record<string, any>> {
  const result = { ...payload };
  const sessionId = payload.session_id;
  const proposalId = payload.proposal_id;
  const feedbackId = payload.feedback_id;

  if (result.merged_code_ref && sessionId && proposalId) {
    try {
      const artifactPath = resolveProposalArtifactPath(
        workspaceRoot,
        sessionId,
        proposalId,
        result.merged_code_ref,
      );
      result.merged_code_ref = await fs.readFile(artifactPath, 'utf8');
    } catch (e) {
      console.warn(`Failed to inline merged_code_ref: ${e}`);
    }
  }

  if (result.final_code_ref && sessionId && feedbackId) {
    try {
      const artifactPath = resolveFinalCodeArtifactPath(
        workspaceRoot,
        sessionId,
        feedbackId,
        result.final_code_ref,
      );
      result.final_code_ref = await fs.readFile(artifactPath, 'utf8');
    } catch (e) {
      console.warn(`Failed to inline final_code_ref: ${e}`);
    }
  }

  return result;
}

export async function exportTrainingCandidatesToJsonl(
  workspaceRoot: string,
  candidates: TrainingCandidatePayload[],
): Promise<ExportResult> {
  let sftCount = 0;
  let dpoCount = 0;
  const lines: string[] = [];

  for (const candidate of candidates) {
    try {
      // 1. prompt_ref 읽기
      let promptText = '';
      if (candidate.prompt_ref) {
        const promptPath = resolveTrainingCandidateArtifactPath(
          workspaceRoot,
          candidate.training_candidate_id,
          candidate.prompt_ref,
        );
        promptText = await fs.readFile(promptPath, 'utf8');
      }

      // 2. chosen_ref 읽기 및 인라인/필터링 처리
      let chosenObj: any = {};
      if (candidate.chosen_ref) {
        const chosenPath = resolveTrainingCandidateArtifactPath(
          workspaceRoot,
          candidate.training_candidate_id,
          candidate.chosen_ref,
        );
        const chosenRaw = await fs.readFile(chosenPath, 'utf8');
        chosenObj = JSON.parse(chosenRaw);
        chosenObj = await inlineArtifactRefs(workspaceRoot, chosenObj);
        chosenObj = filterSystemMetadata(chosenObj);
      }

      // 3. dataset_type에 따라 jsonl 구성
      if (candidate.dataset_type === 'sft') {
        lines.push(JSON.stringify({ prompt: promptText, chosen: chosenObj }));
        sftCount++;
      } else if (candidate.dataset_type === 'dpo') {
        let rejectedObj: any = {};
        if (candidate.rejected_ref) {
          const rejectedPath = resolveTrainingCandidateArtifactPath(
            workspaceRoot,
            candidate.training_candidate_id,
            candidate.rejected_ref,
          );
          const rejectedRaw = await fs.readFile(rejectedPath, 'utf8');
          rejectedObj = JSON.parse(rejectedRaw);
          rejectedObj = await inlineArtifactRefs(workspaceRoot, rejectedObj);
          rejectedObj = filterSystemMetadata(rejectedObj);
        }
        lines.push(
          JSON.stringify({ prompt: promptText, chosen: chosenObj, rejected: rejectedObj }),
        );
        dpoCount++;
      }
    } catch (e) {
      console.error(`Error processing candidate ${candidate.training_candidate_id}:`, e);
    }
  }

  // 4. 결과 파일 쓰기 (.vscode/gitcat/ai/exports/export_YYYYMMDD_HHMMSS.jsonl)
  const dateStr = new Date().toISOString().replace(/[:.]/g, '').split('T').join('_').slice(0, 15);
  const exportsDir = path.join(workspaceRoot, '.vscode', 'gitcat', 'ai', 'exports');
  await fs.mkdir(exportsDir, { recursive: true });

  const fileName = `export_${dateStr}.jsonl`;
  const filePath = path.join(exportsDir, fileName);

  await fs.writeFile(filePath, lines.join('\n'), 'utf8');

  return {
    filePath,
    processedCount: sftCount + dpoCount,
    sftCount,
    dpoCount,
  };
}
