import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  ChangeRecordRow,
  ChangedFileRow,
  ConflictCandidate,
  MergeProposalRow,
  ProposalFeedbackRow,
  RecommendationHistoryRow,
  SnapshotFileRow,
  SnapshotRow,
} from '@gitcat/shared-types';
import type { MergeRepositoryBundle } from '../../storage/interfaces';
import { MergeAnalysisArtifactStore } from './MergeAnalysisArtifactStore';

export type RuntimeRagSourceType =
  | 'merge_analysis_artifact'
  | 'conflict_candidate'
  | 'proposal_feedback'
  | 'merge_proposal'
  | 'recommendation_history'
  | 'snapshot'
  | 'snapshot_file'
  | 'change_record'
  | 'changed_file';

export interface RuntimeRagSearchResult {
  id: string;
  source_type: RuntimeRagSourceType;
  title: string;
  content: string;
  file_path?: string;
  created_at?: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface RuntimeRagContextBundle {
  schema_version: 'runtime-merge-rag-context-v1';
  analysis_id: string;
  project_id: string;
  session_id: string;
  candidate_id: string;
  query: RuntimeRagQuery;
  budget: {
    max_chars: number;
    used_chars: number;
    truncated: boolean;
  };
  ranking: {
    top_k: number;
    strategy: 'lexical-local-history';
  };
  items: RuntimeRagSearchResult[];
  created_at: string;
}

export interface RuntimeRagQuery {
  file_path: string;
  source_branch?: string;
  target_branch?: string;
  reason_summary?: string;
  risk_level?: string;
  source_excerpt?: string;
  target_excerpt?: string;
  base_excerpt?: string;
  working_diff_summary?: string;
}

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

export interface RuntimeRagMergeAnalysisArtifact {
  analysis_id: string;
  project_id: string;
  session_id: string;
  source_worktree_instance_id?: string;
  target_worktree_instance_id?: string;
  source_branch?: string;
  target_branch?: string;
  related_files?: string[];
  branch_diff_text?: string;
  source_diff_text?: string;
  target_diff_text?: string;
  candidates: MergeAnalysisArtifactCandidate[];
}

interface BuildContextBundleInput {
  analysis: RuntimeRagMergeAnalysisArtifact;
  candidate: ConflictCandidate;
  previousFeedback: ProposalFeedbackRow[];
  maxChars?: number;
  topK?: number;
}

export interface RuntimeRagEmbeddingRanker {
  rank(
    documents: RuntimeRagSearchResult[],
    queryText: string,
  ): Promise<Array<RuntimeRagSearchResult & { score: number }>>;
}

export class LocalEmbeddingRuntimeRagRanker implements RuntimeRagEmbeddingRanker {
  async rank(
    documents: RuntimeRagSearchResult[],
    queryText: string,
  ): Promise<Array<RuntimeRagSearchResult & { score: number }>> {
    const { LocalVectorStore } = await import('@gitcat/ai-pipeline') as any;
    const store = new LocalVectorStore();
    await store.addDocuments(documents.map((document) => ({
      id: document.id,
      content: [
        document.title,
        document.file_path,
        document.source_type,
        document.content,
      ].filter(Boolean).join('\n'),
      metadata: { runtimeRagDocument: document },
    })));

    const results: Array<{ document: { metadata?: Record<string, unknown> }; score: number }> =
      await store.search(queryText, documents.length);
    return results.map((result) => ({
      ...(result.document.metadata?.runtimeRagDocument as RuntimeRagSearchResult),
      score: result.score,
    }));
  }
}

const DEFAULT_MAX_CHARS = 12000;
const DEFAULT_TOP_K = 12;
const MAX_ITEM_CHARS = 1800;

export class RuntimeMergeRagService {
  constructor(
    private readonly repositories: Pick<
      MergeRepositoryBundle,
      | 'mergeProposals'
      | 'proposalFeedbacks'
      | 'recommendationHistories'
      | 'snapshots'
      | 'snapshotFiles'
      | 'changeRecords'
      | 'changedFiles'
    >,
    private readonly artifactStore: MergeAnalysisArtifactStore,
    private readonly workspaceRoot: string,
    private readonly embeddingRanker?: RuntimeRagEmbeddingRanker,
  ) {}

  async buildAndStore(input: BuildContextBundleInput): Promise<{
    bundle: RuntimeRagContextBundle;
    relativePath: string;
  }> {
    const bundle = await this.build(input);
    const artifact = await this.artifactStore.writeContextBundle(
      this.workspaceRoot,
      input.analysis.analysis_id,
      bundle,
    );
    return { bundle, relativePath: artifact.relativePath };
  }

  async build(input: BuildContextBundleInput): Promise<RuntimeRagContextBundle> {
    const query = this.toQuery(input.analysis, input.candidate);
    const documents = await this.collectDocuments(input, query);
    const ranked = (await this.rank(documents, query)).slice(0, input.topK ?? DEFAULT_TOP_K);
    const budgeted = this.applyBudget(ranked, input.maxChars ?? DEFAULT_MAX_CHARS);

    return {
      schema_version: 'runtime-merge-rag-context-v1',
      analysis_id: input.analysis.analysis_id,
      project_id: input.analysis.project_id,
      session_id: input.analysis.session_id,
      candidate_id: input.candidate.candidate_id,
      query,
      budget: budgeted.budget,
      ranking: {
        top_k: input.topK ?? DEFAULT_TOP_K,
        strategy: 'lexical-local-history',
      },
      items: budgeted.items,
      created_at: new Date().toISOString(),
    };
  }

  private async collectDocuments(
    input: BuildContextBundleInput,
    query: RuntimeRagQuery,
  ): Promise<RuntimeRagSearchResult[]> {
    const docs: RuntimeRagSearchResult[] = [];
    docs.push(...this.analysisDocuments(input.analysis, query));
    docs.push(...this.feedbackDocuments(input.previousFeedback));
    docs.push(...await this.proposalDocuments(input.analysis.analysis_id));
    docs.push(...await this.recommendationDocuments(input.analysis.project_id));
    docs.push(...await this.snapshotDocuments(input.analysis));
    docs.push(...await this.changeRecordDocuments(input.analysis.session_id));
    return docs.filter((doc) => doc.content.trim().length > 0);
  }

  private analysisDocuments(
    analysis: RuntimeRagMergeAnalysisArtifact,
    query: RuntimeRagQuery,
  ): RuntimeRagSearchResult[] {
    const docs: RuntimeRagSearchResult[] = [];
    docs.push({
      id: `${analysis.analysis_id}:summary`,
      source_type: 'merge_analysis_artifact',
      title: 'Current merge analysis summary',
      content: [
        `source_branch=${analysis.source_branch ?? 'N/A'}`,
        `target_branch=${analysis.target_branch ?? 'N/A'}`,
        `related_files=${(analysis.related_files ?? []).join(', ')}`,
        `working_diff_summary=${query.working_diff_summary ?? 'N/A'}`,
      ].join('\n'),
      score: 0,
    });

    for (const candidate of analysis.candidates) {
      docs.push({
        id: candidate.candidate_id,
        source_type: 'conflict_candidate',
        title: `Conflict candidate ${candidate.file_path}`,
        file_path: candidate.file_path,
        content: [
          `file_path=${candidate.file_path}`,
          `lines=${candidate.line_start}-${candidate.line_end}`,
          `reason=${candidate.reason ?? 'N/A'}`,
          `risk_level=${candidate.risk_level ?? 'N/A'}`,
          `source_excerpt:\n${candidate.source_excerpt ?? ''}`,
          `target_excerpt:\n${candidate.target_excerpt ?? ''}`,
          `base_excerpt:\n${candidate.base_excerpt ?? ''}`,
        ].join('\n'),
        score: 0,
        metadata: {
          detected_by: candidate.detected_by,
          confidence_score: candidate.confidence_score,
        },
      });
    }

    return docs;
  }

  private feedbackDocuments(feedbacks: ProposalFeedbackRow[]): RuntimeRagSearchResult[] {
    return feedbacks.map((feedback) => ({
      id: feedback.feedback_id,
      source_type: 'proposal_feedback',
      title: `Proposal feedback ${feedback.selection_status}`,
      content: [
        `selection_status=${feedback.selection_status}`,
        `quality_tag=${feedback.quality_tag ?? 'N/A'}`,
        `final_text=${feedback.final_text ?? ''}`,
        `final_explanation=${feedback.final_explanation ?? ''}`,
        `feedback_note=${feedback.feedback_note ?? ''}`,
      ].join('\n'),
      created_at: feedback.decided_at,
      score: 0,
      metadata: {
        proposal_id: feedback.proposal_id,
        merge_proposal_id: feedback.merge_proposal_id,
        final_code_ref: feedback.final_code_ref,
      },
    }));
  }

  private async proposalDocuments(analysisId: string): Promise<RuntimeRagSearchResult[]> {
    try {
      const proposals = await this.repositories.mergeProposals.listByAnalysis(analysisId);
      return proposals.map((proposal) => this.proposalDocument(proposal));
    } catch (error) {
      console.warn('GitCat runtime merge RAG proposal search failed:', error);
      return [];
    }
  }

  private proposalDocument(proposal: MergeProposalRow): RuntimeRagSearchResult {
    return {
      id: proposal.proposal_id,
      source_type: 'merge_proposal',
      title: proposal.title,
      file_path: proposal.file_path,
      content: [
        `file_path=${proposal.file_path}`,
        `feature_type=${proposal.feature_type}`,
        `title=${proposal.title}`,
        `summary=${proposal.explanation_summary ?? ''}`,
        `validation_summary=${proposal.validation_summary ?? ''}`,
        `status=${proposal.status}`,
      ].join('\n'),
      created_at: proposal.created_at,
      score: 0,
      metadata: {
        candidate_id: proposal.candidate_id,
        confidence_score: proposal.confidence_score,
      },
    };
  }

  private async recommendationDocuments(projectId: string): Promise<RuntimeRagSearchResult[]> {
    try {
      const histories = (await this.repositories.recommendationHistories?.listByProject(projectId, 20) ?? []) as RecommendationHistoryRow[];
      return histories.map((history) => this.recommendationDocument(history));
    } catch (error) {
      console.warn('GitCat runtime merge RAG recommendation search failed:', error);
      return [];
    }
  }

  private recommendationDocument(history: RecommendationHistoryRow): RuntimeRagSearchResult {
    return {
      id: history.recommendation_id,
      source_type: 'recommendation_history',
      title: `Recommendation ${history.recommendation_type}`,
      content: [
        `type=${history.recommendation_type}`,
        `input_summary=${history.input_summary ?? ''}`,
        `result_text=${history.result_text}`,
        `basis=${history.generation_basis_summary ?? ''}`,
        `followup_notes=${history.followup_notes ?? ''}`,
        `warnings=${history.warnings_json ?? ''}`,
      ].join('\n'),
      created_at: history.created_at,
      score: 0,
      metadata: {
        session_id: history.session_id,
        ai_request_id: history.ai_request_id,
      },
    };
  }

  private async snapshotDocuments(
    analysis: RuntimeRagMergeAnalysisArtifact,
  ): Promise<RuntimeRagSearchResult[]> {
    const worktreeIds = [
      analysis.source_worktree_instance_id,
      analysis.target_worktree_instance_id,
    ].filter((id): id is string => Boolean(id));

    if (!this.repositories.snapshots || worktreeIds.length === 0) {
      return [];
    }

    const docs: RuntimeRagSearchResult[] = [];
    try {
      for (const worktreeId of worktreeIds) {
        const snapshots = await this.repositories.snapshots.listByWorkspace(worktreeId, 8) as SnapshotRow[];
        for (const snapshot of snapshots) {
          docs.push(this.snapshotDocument(snapshot));
          docs.push(...await this.snapshotFileDocuments(snapshot.snapshot_id));
        }
      }
    } catch (error) {
      console.warn('GitCat runtime merge RAG snapshot search failed:', error);
    }
    return docs;
  }

  private snapshotDocument(snapshot: SnapshotRow): RuntimeRagSearchResult {
    return {
      id: snapshot.snapshot_id,
      source_type: 'snapshot',
      title: `Snapshot ${snapshot.type}`,
      content: [
        `type=${snapshot.type}`,
        `reason=${snapshot.reason ?? ''}`,
        `summary=${snapshot.summary ?? ''}`,
        `safety_warnings=${(snapshot as SnapshotRow & { safety_warnings_json?: string | null }).safety_warnings_json ?? ''}`,
      ].join('\n'),
      created_at: snapshot.created_at,
      score: 0,
      metadata: {
        session_id: snapshot.session_id,
        local_path: snapshot.local_path,
      },
    };
  }

  private async snapshotFileDocuments(snapshotId: string): Promise<RuntimeRagSearchResult[]> {
    try {
      const files = (await this.repositories.snapshotFiles?.listBySnapshotId(snapshotId) ?? []) as SnapshotFileRow[];
      return Promise.all(files.slice(0, 20).map((file) => this.snapshotFileDocument(file)));
    } catch (error) {
      console.warn('GitCat runtime merge RAG snapshot file search failed:', error);
      return [];
    }
  }

  private async snapshotFileDocument(file: SnapshotFileRow): Promise<RuntimeRagSearchResult> {
    const storedExcerpt = await this.readWorkspaceRelativeFile(file.stored_path, 1000);
    return {
      id: file.snapshot_file_id,
      source_type: 'snapshot_file',
      title: `Snapshot file ${file.original_path}`,
      file_path: this.normalizeFilePath(file.original_path),
      content: [
        `original_path=${file.original_path}`,
        `file_name=${file.file_name}`,
        `content_hash=${file.content_hash ?? ''}`,
        storedExcerpt ? `stored_excerpt:\n${storedExcerpt}` : '',
      ].filter(Boolean).join('\n'),
      created_at: file.created_at,
      score: 0,
      metadata: {
        snapshot_id: file.snapshot_id,
        stored_path: file.stored_path,
      },
    };
  }

  private async changeRecordDocuments(sessionId: string): Promise<RuntimeRagSearchResult[]> {
    if (!this.repositories.changeRecords) {
      return [];
    }

    const docs: RuntimeRagSearchResult[] = [];
    try {
      const records = await this.repositories.changeRecords.listBySession(sessionId, 20) as ChangeRecordRow[];
      for (const record of records) {
        docs.push(this.changeRecordDocument(record));
        const files = (await this.repositories.changedFiles?.listByRecordId(record.record_id) ?? []) as ChangedFileRow[];
        docs.push(...files.map((file) => this.changedFileDocument(file, record.created_at)));
      }
    } catch (error) {
      console.warn('GitCat runtime merge RAG change record search failed:', error);
    }
    return docs;
  }

  private changeRecordDocument(record: ChangeRecordRow): RuntimeRagSearchResult {
    return {
      id: record.record_id,
      source_type: 'change_record',
      title: `Change record ${record.branch_name ?? ''}`.trim(),
      content: [
        `branch_name=${record.branch_name ?? ''}`,
        `description=${record.description ?? ''}`,
      ].join('\n'),
      created_at: record.created_at,
      score: 0,
      metadata: {
        session_id: record.session_id,
      },
    };
  }

  private changedFileDocument(file: ChangedFileRow, recordCreatedAt?: string): RuntimeRagSearchResult {
    return {
      id: file.changed_file_id,
      source_type: 'changed_file',
      title: `Changed file ${file.file_path}`,
      file_path: this.normalizeFilePath(file.file_path),
      content: [
        `file_path=${file.file_path}`,
        `change_type=${file.change_type}`,
        `location=${file.location ?? ''}`,
        `summary=${file.summary ?? ''}`,
      ].join('\n'),
      created_at: file.created_at ?? recordCreatedAt,
      score: 0,
      metadata: {
        record_id: file.record_id,
      },
    };
  }

  private async rank(
    docs: RuntimeRagSearchResult[],
    query: RuntimeRagQuery,
  ): Promise<RuntimeRagSearchResult[]> {
    const queryText = this.queryText(query);
    if (this.embeddingRanker) {
      try {
        const embeddingRanked = await this.embeddingRanker.rank(docs, queryText);
        return embeddingRanked.sort((a, b) => b.score - a.score);
      } catch (error) {
        console.warn('GitCat runtime merge RAG embedding search failed; using lexical fallback:', error);
      }
    }

    return this.lexicalRank(docs, query, queryText);
  }

  private lexicalRank(
    docs: RuntimeRagSearchResult[],
    query: RuntimeRagQuery,
    queryText: string,
  ): RuntimeRagSearchResult[] {
    const queryTerms = this.tokenize(queryText);
    const queryFile = this.normalizeFilePath(query.file_path);

    return docs
      .map((doc) => {
        const docFile = doc.file_path ? this.normalizeFilePath(doc.file_path) : '';
        const fileScore = docFile === queryFile
          ? 40
          : docFile.endsWith(path.posix.basename(queryFile)) || queryFile.endsWith(path.posix.basename(docFile))
            ? 18
            : 0;
        const lexicalScore = this.lexicalScore(queryTerms, doc);
        const recencyScore = this.recencyScore(doc.created_at);
        const sourceScore = this.sourcePriority(doc.source_type);

        return {
          ...doc,
          score: Number((fileScore + lexicalScore + recencyScore + sourceScore).toFixed(4)),
        };
      })
      .sort((a, b) => b.score - a.score || a.source_type.localeCompare(b.source_type));
  }

  private queryText(query: RuntimeRagQuery): string {
    const queryText = [
      query.file_path,
      query.source_branch,
      query.target_branch,
      query.reason_summary,
      query.risk_level,
      query.source_excerpt,
      query.target_excerpt,
      query.base_excerpt,
      query.working_diff_summary,
    ].filter(Boolean).join(' ');
    return queryText;
  }

  private applyBudget(
    items: RuntimeRagSearchResult[],
    maxChars: number,
  ): { items: RuntimeRagSearchResult[]; budget: RuntimeRagContextBundle['budget'] } {
    let usedChars = 0;
    let truncated = false;
    const output: RuntimeRagSearchResult[] = [];

    for (const item of items) {
      const available = maxChars - usedChars;
      if (available <= 0) {
        truncated = true;
        break;
      }

      const content = item.content.length > Math.min(MAX_ITEM_CHARS, available)
        ? `${item.content.slice(0, Math.min(MAX_ITEM_CHARS, available))}\n[truncated]`
        : item.content;
      truncated = truncated || content.length < item.content.length;
      usedChars += content.length;
      output.push({ ...item, content });
    }

    return {
      items: output,
      budget: {
        max_chars: maxChars,
        used_chars: usedChars,
        truncated,
      },
    };
  }

  private toQuery(
    analysis: RuntimeRagMergeAnalysisArtifact,
    candidate: ConflictCandidate,
  ): RuntimeRagQuery {
    return {
      file_path: candidate.file_path,
      source_branch: analysis.source_branch,
      target_branch: analysis.target_branch,
      reason_summary: candidate.reason_summary,
      risk_level: candidate.risk_level,
      source_excerpt: candidate.source_code,
      target_excerpt: candidate.target_code,
      base_excerpt: candidate.base_code,
      working_diff_summary: this.diffSummaryForFile(analysis, candidate.file_path),
    };
  }

  private diffSummaryForFile(
    analysis: RuntimeRagMergeAnalysisArtifact,
    filePath: string,
  ): string | undefined {
    const normalized = this.normalizeFilePath(filePath);
    const diffText = [
      analysis.branch_diff_text,
      analysis.source_diff_text,
      analysis.target_diff_text,
    ].filter(Boolean).join('\n');
    if (!diffText) {
      return undefined;
    }

    const section = diffText
      .split(/^diff --git /m)
      .map((part, index) => index === 0 ? part : `diff --git ${part}`)
      .find((part) => part.includes(` b/${normalized}`) || part.includes(` a/${normalized}`));

    return (section ?? diffText).slice(0, 1200);
  }

  private lexicalScore(queryTerms: Set<string>, doc: RuntimeRagSearchResult): number {
    if (queryTerms.size === 0) {
      return 0;
    }

    const docTerms = this.tokenize([
      doc.title,
      doc.file_path,
      doc.content,
      doc.source_type,
    ].filter(Boolean).join(' '));
    let matches = 0;
    for (const term of queryTerms) {
      if (docTerms.has(term)) {
        matches += 1;
      }
    }
    return Math.min(30, matches * 2);
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/i)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    );
  }

  private recencyScore(createdAt?: string): number {
    if (!createdAt) {
      return 0;
    }
    const time = Date.parse(createdAt);
    if (Number.isNaN(time)) {
      return 0;
    }
    const ageDays = Math.max(0, (Date.now() - time) / (24 * 60 * 60 * 1000));
    return Math.max(0, 12 - ageDays);
  }

  private sourcePriority(sourceType: RuntimeRagSourceType): number {
    switch (sourceType) {
      case 'conflict_candidate':
        return 20;
      case 'merge_analysis_artifact':
        return 16;
      case 'proposal_feedback':
        return 14;
      case 'merge_proposal':
        return 12;
      case 'recommendation_history':
        return 9;
      case 'changed_file':
        return 8;
      case 'change_record':
        return 7;
      case 'snapshot_file':
        return 6;
      case 'snapshot':
        return 5;
    }
  }

  private async readWorkspaceRelativeFile(
    relativePath: string,
    maxChars: number,
  ): Promise<string | undefined> {
    const normalized = this.normalizeFilePath(relativePath);
    if (path.isAbsolute(normalized)) {
      return undefined;
    }
    const root = path.resolve(this.workspaceRoot);
    const absolutePath = path.resolve(root, normalized);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
      return undefined;
    }

    try {
      const content = await fs.readFile(absolutePath, 'utf8');
      return content.slice(0, maxChars);
    } catch {
      return undefined;
    }
  }

  private normalizeFilePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }
}
