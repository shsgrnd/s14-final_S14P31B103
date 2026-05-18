import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { MergeProposalInput } from '@gitcat/shared-types';
import { buildMergePatchDraftUserPrompt, getMergePatchDraftSystemPrompt } from './merge-conflict';

function createPayload(contextBundleRef?: string): MergeProposalInput {
  return {
    project_id: 'project_rag_test',
    session_id: 'session_rag_test',
    feature_type: 'merge_patch_draft',
    current_branch: 'feature/source',
    target_branch: 'develop',
    workspace_summary: 'repo=gitcat',
    related_files: ['src/conflict.ts'],
    conflict_candidates: [{
      candidate_id: 'candidate_1',
      analysis_id: 'analysis_1',
      file_path: 'src/conflict.ts',
      line_start: 10,
      line_end: 20,
      source_code: 'const value = sourceValue;',
      target_code: 'const value = targetValue;',
      reason_summary: 'Both branches changed the same assignment.',
      risk_level: 'high',
      detected_by: 'diff',
    }],
    working_tree_diff_ref: 'merge-analysis:analysis_1:diff',
    context_bundle_ref: contextBundleRef,
    risk_summary: 'candidate_count=1; high_risk_count=1',
    schema_version: 'merge-input-v1',
  };
}

async function withTempWorkspace(
  bundle: unknown,
  run: (workspaceRoot: string, ref: string) => Promise<void>,
): Promise<void> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitcat-rag-prompt-'));
  const ref = '.vscode/gitcat/merge-sessions/analysis_1/context-bundle.json';
  const absolutePath = path.join(workspaceRoot, ref);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, JSON.stringify(bundle, null, 2), 'utf8');
  await run(workspaceRoot, ref);
}

async function run(): Promise<void> {
  const systemPrompt = getMergePatchDraftSystemPrompt();
  assert.equal(systemPrompt.includes('current Conflict Candidates source_code, target_code, and base_code as the primary truth'), true);
  assert.equal(systemPrompt.includes('Use Retrieved Runtime Context only as supporting local history'), true);

  await withTempWorkspace({
    schema_version: 'merge-context-bundle-v1',
    metadata: { source_count: 3, result_count: 1 },
    budget: { used_chars: 96, max_chars: 12000, truncated: false },
    ai_context_summary: 'Previous accepted feedback kept source validation and target error handling.',
    results: [{
      source_kind: 'feedback',
      source_type: 'proposal_feedback',
      title: 'Accepted previous fix',
      file_path: 'src/conflict.ts',
      score: 71.25,
      recency_score: 10,
      file_match_score: 40,
      content: 'Previous accepted feedback kept source validation and target error handling.',
    }],
  }, async (workspaceRoot, ref) => {
    const prompt = await buildMergePatchDraftUserPrompt(createPayload(ref), workspaceRoot);
    assert.equal(prompt.includes('Retrieved Runtime Context:'), true);
    assert.equal(prompt.includes('rag_executed=true'), true);
    assert.equal(prompt.includes('source_count=3'), true);
    assert.equal(prompt.includes('result_count=1'), true);
    assert.match(prompt, /injected_chars=\d+/);
    assert.equal(prompt.includes('prompt_truncated=false'), true);
    assert.equal(prompt.includes('proposal_feedback'), true);
    assert.equal(prompt.includes('Previous accepted feedback'), true);
    assert.equal(prompt.includes('Use Retrieved Runtime Context to infer local project conventions'), true);
    assert.equal(prompt.includes('synthetic_dataset'), false);
  });

  await withTempWorkspace({
    schema_version: 'merge-context-bundle-v1',
    metadata: { source_count: 0, result_count: 0 },
    budget: { used_chars: 0, max_chars: 12000, truncated: false },
    results: [],
  }, async (workspaceRoot, ref) => {
    const prompt = await buildMergePatchDraftUserPrompt(createPayload(ref), workspaceRoot);
    assert.equal(prompt.includes('rag_executed=true'), true);
    assert.equal(prompt.includes('result_count=0'), true);
    assert.equal(prompt.includes('No local history matches found.'), true);
  });

  await withTempWorkspace({
    schema_version: 'merge-context-bundle-v1',
    metadata: { source_count: 9, result_count: 1 },
    budget: { used_chars: 12000, max_chars: 12000, truncated: true },
    results: [{
      source_kind: 'change_record',
      source_type: 'changed_file',
      title: 'Changed file src/conflict.ts',
      file_path: 'src/conflict.ts',
      score: 55,
      recency_score: 5,
      file_match_score: 40,
      content: 'important prior change\n[truncated]',
    }],
  }, async (workspaceRoot, ref) => {
    const prompt = await buildMergePatchDraftUserPrompt(createPayload(ref), workspaceRoot);
    assert.equal(prompt.includes('bundle_truncated=true'), true);
    assert.equal(prompt.includes('[truncated]'), true);
  });

  await withTempWorkspace({
    schema_version: 'merge-context-bundle-v1',
    metadata: { source_count: 10, result_count: 8 },
    budget: { used_chars: 12000, max_chars: 12000, truncated: false },
    ai_context_summary: 'Top local history should be injected before lower-ranked items.',
    results: Array.from({ length: 8 }, (_, index) => ({
      source_kind: 'feedback',
      source_type: 'proposal_feedback',
      title: `Ranked item ${index + 1}`,
      file_path: 'src/conflict.ts',
      score: 100 - index,
      recency_score: 10,
      file_match_score: 40,
      content: `content for ranked item ${index + 1}`,
    })),
  }, async (workspaceRoot, ref) => {
    const prompt = await buildMergePatchDraftUserPrompt(createPayload(ref), workspaceRoot);
    assert.equal(prompt.includes('result_count=8'), true);
    assert.equal(prompt.includes('prompt_truncated=true'), true);
    assert.equal(prompt.includes('omitted_results=2'), true);
    assert.equal(prompt.includes('Ranked item 1'), true);
    assert.equal(prompt.includes('Ranked item 6'), true);
    assert.equal(prompt.includes('Ranked item 7'), false);
  });

  const promptWithoutBundle = await buildMergePatchDraftUserPrompt(createPayload(), undefined);
  assert.equal(promptWithoutBundle.includes('Retrieved Runtime Context:'), true);
  assert.equal(promptWithoutBundle.includes('N/A'), true);

  console.log('merge-conflict RAG prompt tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
