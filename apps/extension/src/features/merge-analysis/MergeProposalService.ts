import { createHash } from 'crypto';
import type {
  AcceptMergeRequest,
  ConflictCandidate,
  GetAiDraftRequest,
  MergeProposalInput,
  MergeProposalRow,
  MergeProposalView,
  ParsedAiResult,
  ProposalFeedbackRow,
  RejectMergeRequest,
} from '@gitcat/shared-types';
import {
  MergeProposalInputSchema,
} from '@gitcat/shared-types';
import type { MergeRepositoryBundle } from '../../storage/interfaces';
import { MergeAnalysisArtifactStore } from './MergeAnalysisArtifactStore';

type MergeProposalFeatureType = Extract<
  MergeProposalInput['feature_type'],
  'merge_patch_draft' | 'merge_mediation' | 'conflict_explanation'
>;

interface MergeAnalysisArtifactCandidate {
  candidate_id: string;
  file_path: string;
  line_start: number;
  line_end: number;
  detected_by: ConflictCandidate['detected_by'];
  confidence_score?: number;
  reason?: string;
  suggestion?: string;
  source_excerpt?: string;
  target_excerpt?: string;
  base_excerpt?: string;
  risk_level?: ConflictCandidate['risk_level'];
}

interface MergeAnalysisArtifact {
  schema_version: string;
  analysis_id: string;
  project_id: string;
  session_id: string;
  source_branch: string;
  target_branch: string;
  related_files: string[];
  working_tree_diff_ref?: string;
  context_bundle_ref?: string;
  branch_diff_text?: string;
  candidates: MergeAnalysisArtifactCandidate[];
}

interface StoredProposalArtifactEntry {
  proposal_id: string;
  candidate_id: string;
  analysis_id: string;
  file_path: string;
  feature_type: MergeProposalFeatureType;
  title: string;
  summary: string;
  proposed_content: string;
  explanation: string;
  source_content?: string;
  target_content?: string;
  confidence_score?: number;
  validation_required?: boolean;
  validation_summary?: string;
  status: MergeProposalRow['status'];
  parsed_result: ParsedAiResult;
  created_at: string;
}

interface StoredProposalsArtifact {
  schema_version: string;
  analysis_id: string;
  project_id: string;
  session_id: string;
  ai_input: MergeProposalInput;
  feedback_history: ProposalFeedbackRow[];
  proposals: StoredProposalArtifactEntry[];
  updated_at: string;
}

export interface GeneratedMergeProposal {
  parsedResult: Exclude<ParsedAiResult, { feature_type: 'recommendation' }>;
  proposedContent: string;
  explanation: string;
  sourceContent?: string;
  targetContent?: string;
}

export interface MergeProposalProviderInput {
  aiInput: MergeProposalInput;
  analysis: MergeAnalysisArtifact;
  candidate: ConflictCandidate;
  previousFeedback: ProposalFeedbackRow[];
  proposalRef: string;
}

export interface MergeProposalProvider {
  generate(input: MergeProposalProviderInput): Promise<GeneratedMergeProposal[]>;
}

export interface MergeProposalResult {
  proposals: MergeProposalView[];
}

export interface MergeFeedbackResult {
  proposalId: string;
  feedbackId: string;
  status: 'accepted' | 'rejected';
  finalCodeRef?: string;
}

/**
 * 실제 provider 호출 전까지 사용하는 로컬 MVP provider입니다.
 *
 * 출력 형태는 ParsedAiResult 계열로 맞춰두고, 이후 AI 담당 구현은 이 provider만 교체하면 됩니다.
 */
export class LocalMergeProposalDraftProvider implements MergeProposalProvider {
  async generate(input: MergeProposalProviderInput): Promise<GeneratedMergeProposal[]> {
    const proposalId = `proposal_${hash(`${input.analysis.analysis_id}:${input.candidate.candidate_id}:merge_patch_draft`)}`;
    const title = `${input.candidate.file_path} 병합 초안`;
    const source = input.candidate.source_code.trim();
    const target = input.candidate.target_code.trim();
    const proposedContent = [
      source,
      target && target !== source ? target : '',
    ].filter(Boolean).join('\n');

    return [{
      parsedResult: {
        proposal_id: proposalId,
        session_id: input.analysis.session_id,
        ai_request_id: `ai_request_${hash(`${proposalId}:${input.aiInput.schema_version}`)}`,
        feature_type: 'merge_patch_draft',
        title,
        summary: '충돌 후보의 source/target 변경을 함께 검토할 수 있도록 로컬 초안을 생성했습니다.',
        proposal_status: 'parsed',
        parser_version: 'local-mvp-v1',
        explanation: '실제 AI provider 호출 전 단계의 MVP 초안입니다. AI 담당 구현은 동일 ParsedAiResult 계약으로 교체합니다.',
        confidence_score: input.candidate.risk_level === 'high' ? 0.75 : 0.55,
        merged_code_ref: input.proposalRef,
        applied_files: [input.candidate.file_path],
        validation_required: true,
        validation_summary: '실제 병합 적용 전 사용자의 검토가 필요합니다.',
      },
      proposedContent,
      explanation: 'source와 target 변경 조각을 보존한 로컬 병합 초안입니다.',
      sourceContent: input.candidate.source_code,
      targetContent: input.candidate.target_code,
    }];
  }
}

/**
 * AI 병합 제안 생성, proposals.json 저장, Accept/Reject 피드백 저장을 담당합니다.
 */
export class MergeProposalService {
  constructor(
    private readonly repositories: Pick<
      MergeRepositoryBundle,
      'mergeAnalyses' | 'mergeProposals' | 'proposalFeedbacks'
    >,
    private readonly artifactStore: MergeAnalysisArtifactStore,
    private readonly workspaceRoot: string,
    private readonly provider: MergeProposalProvider = new LocalMergeProposalDraftProvider(),
  ) {}

  async getDraft(request: GetAiDraftRequest): Promise<MergeProposalResult> {
    const existingArtifact = await this.artifactStore.readProposals<StoredProposalsArtifact>(
      this.workspaceRoot,
      request.analysisId,
    );
    const existing = existingArtifact?.proposals.find(
      (proposal) => proposal.candidate_id === request.candidateId
        && proposal.feature_type === (request.featureType ?? 'merge_patch_draft'),
    );
    if (existing) {
      return { proposals: [this.toProposalView(existing)] };
    }

    const analysis = await this.loadAnalysisArtifact(request.analysisId);
    const candidateArtifact = analysis.candidates.find(
      (candidate) => candidate.candidate_id === request.candidateId,
    );
    if (!candidateArtifact) {
      throw new Error(`Merge conflict candidate not found: ${request.candidateId}`);
    }

    const candidate = this.toAiConflictCandidate(analysis, candidateArtifact);
    const aiInput = this.buildAiInput(
      analysis,
      [candidate],
      request.featureType ?? 'merge_patch_draft',
    );
    const feedbackHistory = await this.repositories.proposalFeedbacks.listByProject(
      analysis.project_id,
      10,
    );
    const proposalRef = this.proposalRef(request.analysisId, request.candidateId);
    const generated = await this.provider.generate({
      aiInput,
      analysis,
      candidate,
      previousFeedback: feedbackHistory,
      proposalRef,
    });
    const createdAt = new Date().toISOString();
    const entries = generated.map((proposal) =>
      this.toStoredProposalEntry(request.analysisId, candidate, proposal, createdAt),
    );

    await this.repositories.mergeProposals.insertMany(
      entries.map((entry) => this.toProposalRow(entry)),
    );

    const proposalsArtifact: StoredProposalsArtifact = {
      schema_version: 'merge-proposals-v1',
      analysis_id: request.analysisId,
      project_id: analysis.project_id,
      session_id: analysis.session_id,
      ai_input: aiInput,
      feedback_history: feedbackHistory,
      proposals: [
        ...(existingArtifact?.proposals ?? []),
        ...entries,
      ],
      updated_at: createdAt,
    };
    const artifact = await this.artifactStore.writeProposals(
      this.workspaceRoot,
      request.analysisId,
      proposalsArtifact,
    );
    await this.repositories.mergeAnalyses.attachArtifactPaths(request.analysisId, {
      proposals_artifact_path: artifact.relativePath,
    });

    return { proposals: entries.map((entry) => this.toProposalView(entry)) };
  }

  async accept(request: AcceptMergeRequest): Promise<MergeFeedbackResult> {
    const proposal = await this.requireProposal(request.proposalId);
    const analysis = await this.loadAnalysisArtifact(request.analysisId);
    const feedbackId = this.feedbackId(request.proposalId, 'accepted');
    const finalCode = await this.artifactStore.writeFeedbackFinalCode(
      this.workspaceRoot,
      request.analysisId,
      feedbackId,
      request.proposedContent,
    );

    await this.repositories.proposalFeedbacks.insert({
      feedback_id: feedbackId,
      project_id: analysis.project_id,
      proposal_id: proposal.proposal_id,
      merge_proposal_id: proposal.proposal_id,
      selection_status: 'accepted',
      final_code_ref: finalCode.finalCodeRef,
      final_explanation: request.finalExplanation ?? null,
      quality_tag: 'useful',
      feedback_note: null,
    });
    await this.repositories.mergeProposals.updateStatus(proposal.proposal_id, 'accepted');

    return {
      proposalId: proposal.proposal_id,
      feedbackId,
      status: 'accepted',
      finalCodeRef: finalCode.finalCodeRef,
    };
  }

  async reject(request: RejectMergeRequest): Promise<MergeFeedbackResult> {
    const proposal = await this.requireProposal(request.proposalId);
    const analysis = await this.loadAnalysisArtifact(request.analysisId);
    const feedbackId = this.feedbackId(request.proposalId, 'rejected');

    await this.repositories.proposalFeedbacks.insert({
      feedback_id: feedbackId,
      project_id: analysis.project_id,
      proposal_id: proposal.proposal_id,
      merge_proposal_id: proposal.proposal_id,
      selection_status: 'rejected',
      final_code_ref: null,
      final_explanation: null,
      quality_tag: 'not_useful',
      feedback_note: request.feedbackNote ?? null,
    });
    await this.repositories.mergeProposals.updateStatus(proposal.proposal_id, 'rejected');

    return {
      proposalId: proposal.proposal_id,
      feedbackId,
      status: 'rejected',
    };
  }

  private async requireProposal(proposalId: string): Promise<MergeProposalRow> {
    const proposal = await this.repositories.mergeProposals.findById(proposalId);
    if (!proposal) {
      throw new Error(`Merge proposal not found: ${proposalId}`);
    }
    return proposal;
  }

  private async loadAnalysisArtifact(analysisId: string): Promise<MergeAnalysisArtifact> {
    const analysis = await this.repositories.mergeAnalyses.findById(analysisId);
    if (!analysis?.analysis_artifact_path) {
      throw new Error(`Merge analysis artifact is not ready: ${analysisId}`);
    }
    return this.artifactStore.readAnalysis<MergeAnalysisArtifact>(
      this.workspaceRoot,
      analysisId,
    );
  }

  private buildAiInput(
    analysis: MergeAnalysisArtifact,
    candidates: ConflictCandidate[],
    featureType: MergeProposalFeatureType,
  ): MergeProposalInput {
    return MergeProposalInputSchema.parse({
      project_id: analysis.project_id,
      session_id: analysis.session_id,
      feature_type: featureType,
      current_branch: analysis.source_branch,
      target_branch: analysis.target_branch,
      workspace_summary: `analysis=${analysis.analysis_id}`,
      related_files: analysis.related_files,
      conflict_candidates: candidates,
      working_tree_diff_ref: analysis.working_tree_diff_ref
        ?? `merge-analysis:${analysis.analysis_id}:diff`,
      context_bundle_ref: analysis.context_bundle_ref
        ?? `merge-analysis:${analysis.analysis_id}:context-bundle`,
      risk_summary: this.riskSummary(analysis.candidates),
      schema_version: 'merge-input-v1',
    });
  }

  private toAiConflictCandidate(
    analysis: MergeAnalysisArtifact,
    candidate: MergeAnalysisArtifactCandidate,
  ): ConflictCandidate {
    return {
      candidate_id: candidate.candidate_id,
      analysis_id: analysis.analysis_id,
      file_path: candidate.file_path,
      line_start: candidate.line_start,
      line_end: candidate.line_end,
      source_code: candidate.source_excerpt ?? '',
      target_code: candidate.target_excerpt ?? '',
      base_code: candidate.base_excerpt,
      reason_summary: candidate.reason,
      risk_level: candidate.risk_level,
      detected_by: candidate.detected_by,
    };
  }

  private toStoredProposalEntry(
    analysisId: string,
    candidate: ConflictCandidate,
    proposal: GeneratedMergeProposal,
    createdAt: string,
  ): StoredProposalArtifactEntry {
    return {
      proposal_id: proposal.parsedResult.proposal_id,
      candidate_id: candidate.candidate_id,
      analysis_id: analysisId,
      file_path: candidate.file_path,
      feature_type: proposal.parsedResult.feature_type,
      title: proposal.parsedResult.title,
      summary: proposal.parsedResult.summary,
      proposed_content: proposal.proposedContent,
      explanation: proposal.explanation,
      source_content: proposal.sourceContent,
      target_content: proposal.targetContent,
      confidence_score: proposal.parsedResult.confidence_score,
      validation_required: proposal.parsedResult.feature_type === 'merge_patch_draft'
        ? proposal.parsedResult.validation_required
        : undefined,
      validation_summary: proposal.parsedResult.feature_type === 'merge_patch_draft'
        ? proposal.parsedResult.validation_summary
        : undefined,
      status: proposal.parsedResult.proposal_status,
      parsed_result: proposal.parsedResult,
      created_at: createdAt,
    };
  }

  private toProposalRow(entry: StoredProposalArtifactEntry): Omit<MergeProposalRow, 'created_at'> & { created_at?: string } {
    return {
      proposal_id: entry.proposal_id,
      candidate_id: entry.candidate_id,
      ai_request_id: entry.parsed_result.ai_request_id,
      file_path: entry.file_path,
      feature_type: entry.feature_type,
      title: entry.title,
      explanation_summary: entry.summary,
      confidence_score: entry.confidence_score ?? null,
      validation_required: entry.validation_required ? 1 : 0,
      validation_summary: entry.validation_summary ?? null,
      status: entry.status,
      created_at: entry.created_at,
    };
  }

  private toProposalView(entry: StoredProposalArtifactEntry): MergeProposalView {
    return {
      proposalId: entry.proposal_id,
      candidateId: entry.candidate_id,
      analysisId: entry.analysis_id,
      filePath: entry.file_path,
      featureType: entry.feature_type,
      title: entry.title,
      summary: entry.summary,
      sourceContent: entry.source_content,
      targetContent: entry.target_content,
      proposedContent: entry.proposed_content,
      explanation: entry.explanation,
      confidenceScore: entry.confidence_score,
      validationRequired: entry.validation_required,
      validationSummary: entry.validation_summary,
      status: entry.status,
      appliedFiles: entry.parsed_result.feature_type === 'merge_patch_draft'
        ? entry.parsed_result.applied_files
        : undefined,
    };
  }

  private riskSummary(candidates: MergeAnalysisArtifactCandidate[]): string {
    const highCount = candidates.filter((candidate) => candidate.risk_level === 'high').length;
    return `candidate_count=${candidates.length}; high_risk_count=${highCount}`;
  }

  private proposalRef(analysisId: string, candidateId: string): string {
    return `.vscode/gitcat/merge-sessions/${analysisId}/proposals.json#${candidateId}`;
  }

  private feedbackId(proposalId: string, status: 'accepted' | 'rejected'): string {
    return `feedback_${hash(`${proposalId}:${status}:${new Date().toISOString()}`)}`;
  }
}

function hash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}
