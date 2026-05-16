import * as fs from 'fs/promises';
import * as path from 'path';
import { GitCatDatabase } from '@gitcat/storage';

interface ExportOptions {
  workspaceRoot: string;
  outputDir: string;
}

interface ProposalFeedbackRow {
  feedback_id: string;
  selection_status: 'accepted' | 'rejected';
  final_code_ref: string | null;
  final_explanation: string | null;
  proposal_id: string;
  feature_type: string;
  candidate_id: string;
  analysis_id: string;
  proposals_artifact_path: string | null;
}

/**
 * .vscode/gitcat/merge-sessions/<analysis_id>/proposals.json 아티팩트의 구조
 */
interface ProposalsArtifact {
  ai_input: {
    conflict_candidates: any[];
    [key: string]: any;
  };
  proposals: Array<{
    proposal_id: string;
    proposed_content: string;
    explanation: string;
    [key: string]: any;
  }>;
}

async function exportPipeline({ workspaceRoot, outputDir }: ExportOptions) {
  console.log(`[Export Pipeline] Starting extraction for workspace: ${workspaceRoot}`);
  
  // 1. DB 연결
  const db = await GitCatDatabase.create(workspaceRoot);
  const dbInstance = db.getInstance();

  // 2. 피드백 및 연관 데이터 조인 조회
  const query = `
    SELECT 
      f.feedback_id, f.selection_status, f.final_code_ref, f.final_explanation, 
      p.proposal_id, p.feature_type, p.candidate_id,
      a.analysis_id, a.proposals_artifact_path
    FROM proposal_feedbacks f
    JOIN merge_proposals p ON f.proposal_id = p.proposal_id
    JOIN conflict_candidates c ON p.candidate_id = c.candidate_id
    JOIN merge_analyses a ON c.analysis_id = a.analysis_id
  `;

  const rows = dbInstance.prepare(query).all() as unknown as ProposalFeedbackRow[];
  console.log(`[Export Pipeline] Found ${rows.length} feedback records.`);

  if (rows.length === 0) {
    console.log('[Export Pipeline] No data to export.');
    return;
  }

  // 3. Artifact 파일 파싱 및 데이터 구성
  const sftData: any[] = [];
  
  // DPO용 그룹핑 (candidate_id 기준)
  const candidateGroups = new Map<string, {
    prompt: string;
    chosen: string | null;
    rejected: string | null;
  }>();

  for (const row of rows) {
    if (!row.proposals_artifact_path) continue;

    const artifactFullPath = path.resolve(workspaceRoot, row.proposals_artifact_path);
    let artifact: ProposalsArtifact;
    try {
      const content = await fs.readFile(artifactFullPath, 'utf8');
      artifact = JSON.parse(content);
    } catch (e) {
      console.warn(`[Export Pipeline] Could not read artifact for analysis ${row.analysis_id}: ${e}`);
      continue;
    }

    // AI 입력 (프롬프트 뼈대)와 해당 제안(Proposal) 찾기
    const proposal = artifact.proposals.find(p => p.proposal_id === row.proposal_id);
    if (!proposal) continue;

    // 프롬프트 구성 (단순화: 실제 모델에 들어간 System/User Prompt를 모사하거나 ai_input을 통째로 사용)
    const prompt = JSON.stringify(artifact.ai_input, null, 2);
    
    // Output 텍스트 결정 (Accept면 최종 코드, Reject면 제안했던 코드)
    let outputText = proposal.proposed_content;
    if (row.selection_status === 'accepted' && row.final_code_ref) {
      try {
        const finalCodePath = path.resolve(workspaceRoot, row.final_code_ref);
        outputText = await fs.readFile(finalCodePath, 'utf8');
      } catch (e) {
        console.warn(`[Export Pipeline] Could not read final code for feedback ${row.feedback_id}`);
      }
    }

    // SFT (Supervised Fine-Tuning) 데이터 추가 - 수락된(Accepted) 건만!
    if (row.selection_status === 'accepted') {
      sftData.push({
        instruction: `Merge conflict resolution for feature: ${row.feature_type}`,
        input: prompt,
        output: outputText
      });
    }

    // DPO (Direct Preference Optimization) 데이터 그룹핑
    if (!candidateGroups.has(row.candidate_id)) {
      candidateGroups.set(row.candidate_id, { prompt, chosen: null, rejected: null });
    }
    const group = candidateGroups.get(row.candidate_id)!;
    
    if (row.selection_status === 'accepted') {
      group.chosen = outputText;
    } else if (row.selection_status === 'rejected') {
      group.rejected = outputText;
    }
  }

  // DPO 데이터는 chosen과 rejected가 모두 있는 쌍만 유효
  const dpoData = Array.from(candidateGroups.values()).filter(g => g.chosen && g.rejected);

  // 4. 결과 파일 저장 (.jsonl)
  await fs.mkdir(outputDir, { recursive: true });

  const sftPath = path.join(outputDir, 'sft_training_data.jsonl');
  const sftContent = sftData.map(d => JSON.stringify(d)).join('\n');
  await fs.writeFile(sftPath, sftContent, 'utf8');
  console.log(`[Export Pipeline] Saved ${sftData.length} SFT records to ${sftPath}`);

  const dpoPath = path.join(outputDir, 'dpo_training_data.jsonl');
  const dpoContent = dpoData.map(d => JSON.stringify(d)).join('\n');
  await fs.writeFile(dpoPath, dpoContent, 'utf8');
  console.log(`[Export Pipeline] Saved ${dpoData.length} DPO records to ${dpoPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  let workspaceRoot = process.cwd(); // 기본적으로 현재 위치 (혹은 프로젝트 루트)
  
  const workspaceArgIndex = args.indexOf('--workspace');
  if (workspaceArgIndex !== -1 && args[workspaceArgIndex + 1]) {
    workspaceRoot = path.resolve(args[workspaceArgIndex + 1]);
  } else {
    // ai-pipeline 루트에서 실행했다고 가정하고 2단계 위의 workspace root를 찾음
    workspaceRoot = path.resolve(__dirname, '../../../');
  }

  const outputDir = path.resolve(__dirname, '../data');
  
  await exportPipeline({ workspaceRoot, outputDir });
}

main().catch(error => {
  console.error('[Export Pipeline] Error:', error);
  process.exit(1);
});
