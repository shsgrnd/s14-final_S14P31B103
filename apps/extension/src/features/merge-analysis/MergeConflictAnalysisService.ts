import { createHash } from 'crypto';
import type { DiffResult } from '@gitcat/git-core';
import type {
  AnalyzeConflictRequest,
  ConflictCandidateRow,
  ConflictKind,
  MergeCompareContentPayload,
  MergeConflictCandidateView,
  MergeConflictRegion,
} from '@gitcat/shared-types';
import type { MergeRepositoryBundle } from '../../storage/interfaces';
import type { GitService } from '../git/GitService';
import {
  MergeAnalysisInputContext,
  MergeInputAssembler,
} from './MergeInputAssembler';
import { MergeAnalysisArtifactStore } from './MergeAnalysisArtifactStore';
import {
  enrichConflictFields,
  normalizeFilePath,
  parseDiffHunks,
  type ConflictDetectionInput,
} from './mergeConflictEnrichment';

export interface MergeConflictAnalysisResult {
  analysisId: string;
  artifactPath: string | null;
  candidates: MergeConflictCandidateView[];
}

interface DetectedConflictCandidate {
  candidateId: string;
  analysisId: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  severity: 'high' | 'medium' | 'low';
  reason: string;
  suggestion?: string;
  sourceExcerpt?: string;
  targetExcerpt?: string;
  baseExcerpt?: string;
  detectedBy: 'diff';
  riskLevel: 'high' | 'medium' | 'low';
  confidenceScore: number;
  conflictKind: ConflictKind;
  conflictRegions: MergeConflictRegion[];
  sourceFullContent?: string;
  targetFullContent?: string;
  baseFullContent?: string;
}

interface StoredArtifactCandidate {
  candidate_id: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  source_excerpt?: string;
  target_excerpt?: string;
  base_excerpt?: string;
  reason?: string;
  suggestion?: string;
  conflict_kind?: ConflictKind;
  conflict_regions?: MergeConflictRegion[];
  source_full_content?: string;
  target_full_content?: string;
  base_full_content?: string;
  risk_level?: DetectedConflictCandidate['riskLevel'];
  confidence_score?: number;
}

interface StoredAnalysisArtifact {
  source_branch_tip?: string;
  target_branch_tip?: string;
  candidates?: StoredArtifactCandidate[];
}

/**
 * ANALYZE_CONFLICT 요청을 실제 병합 분석 흐름으로 연결합니다.
 */
export class MergeConflictAnalysisService {
  constructor(
    private readonly assembler: MergeInputAssembler,
    private readonly repositories: Pick<
      MergeRepositoryBundle,
      'mergeAnalyses' | 'conflictCandidates'
    >,
    private readonly artifactStore: MergeAnalysisArtifactStore,
    private readonly gitService: GitService,
  ) {}

  /** Webview에서 후보 선택 시 artifact에 저장된 전체 비교 본문을 로드합니다. */
  async getCandidateCompareContent(
    analysisId: string,
    candidateId: string,
  ): Promise<MergeCompareContentPayload | null> {
    const status = await this.gitService.getStatus();
    try {
      const artifact = await this.artifactStore.readAnalysis<StoredAnalysisArtifact>(
        status.repoRoot,
        analysisId,
      );
      const stored = artifact.candidates?.find((c) => c.candidate_id === candidateId);
      if (!stored) {
        return null;
      }
      return {
        analysisId,
        candidateId,
        sourceExcerpt: stored.source_excerpt,
        targetExcerpt: stored.target_excerpt,
        baseExcerpt: stored.base_excerpt,
        sourceFullContent: stored.source_full_content,
        targetFullContent: stored.target_full_content,
        baseFullContent: stored.base_full_content,
        conflictRegions: stored.conflict_regions,
      };
    } catch {
      return null;
    }
  }

  async analyze(request: AnalyzeConflictRequest): Promise<MergeConflictAnalysisResult> {
    const context = await this.assembler.buildAnalysisInput({
      source: request.source,
      target: request.target,
      sessionId: request.sessionId,
    });

    const existing = await this.repositories.mergeAnalyses.findById(context.analysisId);
    if (existing?.status === 'completed') {
      const stale = await this.isAnalysisStale(context);
      if (!stale) {
        return this.loadCompletedAnalysis(context, existing.analysis_artifact_path);
      }
      await this.repositories.conflictCandidates.deleteByAnalysis(context.analysisId);
      await this.repositories.mergeAnalyses.updateStatus(context.analysisId, 'analyzing');
    } else if (!existing) {
      await this.repositories.mergeAnalyses.insert({
        analysis_id: context.analysisId,
        source_worktree_instance_id: context.source.worktreeInstanceId,
        target_worktree_instance_id: context.target.worktreeInstanceId,
        merge_base: context.mergeBase,
        status: 'analyzing',
        analysis_artifact_path: null,
        proposals_artifact_path: null,
      });
    } else {
      await this.repositories.mergeAnalyses.updateStatus(context.analysisId, 'analyzing');
    }

    try {
      const candidates = await this.detectCandidates(context);
      const artifact = await this.artifactStore.writeAnalysis(
        context.repoRoot,
        context.analysisId,
        this.toAnalysisArtifact(context, candidates),
      );

      await this.repositories.conflictCandidates.insertMany(
        candidates.map((candidate) => ({
          candidate_id: candidate.candidateId,
          analysis_id: candidate.analysisId,
          file_path: candidate.filePath,
          line_start: candidate.lineStart,
          line_end: candidate.lineEnd,
          detected_by: candidate.detectedBy,
          confidence_score: candidate.confidenceScore,
        })),
      );
      await this.repositories.mergeAnalyses.attachArtifactPaths(context.analysisId, {
        analysis_artifact_path: artifact.relativePath,
      });
      await this.repositories.mergeAnalyses.updateStatus(context.analysisId, 'completed');

      return {
        analysisId: context.analysisId,
        artifactPath: artifact.relativePath,
        candidates: candidates.map((candidate) => this.toCandidateView(candidate)),
      };
    } catch (error) {
      await this.repositories.mergeAnalyses.updateStatus(context.analysisId, 'failed');
      throw error;
    }
  }

  private async isAnalysisStale(context: MergeAnalysisInputContext): Promise<boolean> {
    try {
      const artifact = await this.artifactStore.readAnalysis<StoredAnalysisArtifact>(
        context.repoRoot,
        context.analysisId,
      );
      if (!artifact.source_branch_tip || !artifact.target_branch_tip) {
        return true;
      }
      return (
        artifact.source_branch_tip !== context.sourceBranchTip
        || artifact.target_branch_tip !== context.targetBranchTip
      );
    } catch {
      return true;
    }
  }

  private async loadCompletedAnalysis(
    context: MergeAnalysisInputContext,
    artifactPath: string | null,
  ): Promise<MergeConflictAnalysisResult> {
    const rows = await this.repositories.conflictCandidates.listByAnalysis(context.analysisId);
    const artifactMap = new Map<string, StoredArtifactCandidate>();

    try {
      const artifact = await this.artifactStore.readAnalysis<StoredAnalysisArtifact>(
        context.repoRoot,
        context.analysisId,
      );
      for (const candidate of artifact.candidates ?? []) {
        artifactMap.set(candidate.candidate_id, candidate);
      }
    } catch {
      // artifact 없으면 DB만 사용
    }

    return {
      analysisId: context.analysisId,
      artifactPath,
      candidates: rows.map((row) =>
        this.toCandidateViewFromRow(row, artifactMap.get(row.candidate_id)),
      ),
    };
  }

  private async detectCandidates(context: MergeAnalysisInputContext): Promise<DetectedConflictCandidate[]> {
    const sourceDiffs = this.toDiffMap(context.sourceDiffs);
    const targetDiffs = this.toDiffMap(context.targetDiffs);
    const sourceHunks = parseDiffHunks(context.sourceDiffText);
    const targetHunks = parseDiffHunks(context.targetDiffText);
    const candidates: DetectedConflictCandidate[] = [];

    for (const [filePath, sourceDiff] of sourceDiffs) {
      const targetDiff = targetDiffs.get(filePath);
      if (!targetDiff || !this.shouldAnalyzeFile(filePath)) {
        continue;
      }

      const detectionInput: ConflictDetectionInput = {
        filePath,
        sourceDiff,
        targetDiff,
        sourceHunks: sourceHunks.get(filePath) ?? [],
        targetHunks: targetHunks.get(filePath) ?? [],
      };

      const enriched = await enrichConflictFields(
        this.gitService,
        detectionInput,
        context.source.branchName,
        context.target.branchName,
        context.mergeBase,
      );

      const severity = this.resolveSeverity(
        sourceDiff,
        targetDiff,
        enriched.hasLineOverlap,
        enriched.conflictKind,
      );
      const riskLevel = severity === 'high' ? 'high' : severity === 'medium' ? 'medium' : 'low';

      candidates.push({
        candidateId: `candidate_${hash(`${context.analysisId}:${filePath}`)}`,
        analysisId: context.analysisId,
        filePath,
        lineStart: enriched.lineStart,
        lineEnd: enriched.lineEnd,
        severity,
        reason: this.buildReason(enriched.conflictKind, enriched.hasLineOverlap),
        suggestion: this.buildSuggestion(enriched.conflictKind),
        sourceExcerpt: enriched.sourceExcerpt,
        targetExcerpt: enriched.targetExcerpt,
        baseExcerpt: enriched.baseFullContent,
        detectedBy: 'diff',
        riskLevel,
        confidenceScore: enriched.hasLineOverlap ? 0.9 : severity === 'high' ? 0.85 : 0.65,
        conflictKind: enriched.conflictKind,
        conflictRegions: enriched.conflictRegions,
        sourceFullContent: enriched.sourceFullContent,
        targetFullContent: enriched.targetFullContent,
        baseFullContent: enriched.baseFullContent,
      });
    }

    return candidates.sort((a, b) => a.filePath.localeCompare(b.filePath));
  }

  private buildReason(kind: ConflictKind, hasLineOverlap: boolean): string {
    if (kind === 'add_add') {
      return 'source와 target 양쪽에서 동일 경로 파일이 새로 추가되었습니다.';
    }
    if (kind === 'full_file') {
      return '같은 파일에서 대규모 변경이 감지되어 전체 파일 비교가 필요합니다.';
    }
    if (hasLineOverlap) {
      return '공통 조상 이후 source와 target 양쪽 diff hunk가 같은 라인 범위를 변경했습니다.';
    }
    return '공통 조상 이후 source와 target 양쪽에서 같은 파일이 변경되었습니다.';
  }

  private buildSuggestion(kind: ConflictKind): string {
    if (kind === 'full_file' || kind === 'add_add') {
      return '전체 파일과 검토 구간 칩을 확인한 뒤 AI 병합 제안 단계로 넘기세요.';
    }
    return '겹치는 구간을 우선 검토한 뒤 AI 병합 제안 단계로 넘기세요.';
  }

  private toDiffMap(diffs: DiffResult[]): Map<string, DiffResult> {
    const map = new Map<string, DiffResult>();
    for (const diff of diffs) {
      map.set(normalizeFilePath(diff.filePath), diff);
      if (diff.oldPath) {
        map.set(normalizeFilePath(diff.oldPath), diff);
      }
    }
    return map;
  }

  private shouldAnalyzeFile(filePath: string): boolean {
    const normalized = normalizeFilePath(filePath);
    const excludedPrefixes = [
      '.git/',
      '.vscode/gitcat/',
      'node_modules/',
      'dist/',
      'build/',
    ];

    if (excludedPrefixes.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))) {
      return false;
    }

    return !/\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|7z|wasm|lock)$/i.test(normalized);
  }

  private resolveSeverity(
    sourceDiff: DiffResult,
    targetDiff: DiffResult,
    hasLineOverlap: boolean,
    conflictKind: ConflictKind,
  ): 'high' | 'medium' | 'low' {
    if (conflictKind === 'add_add' || conflictKind === 'full_file') {
      return 'high';
    }
    if (hasLineOverlap) {
      return 'high';
    }
    if (sourceDiff.status === 'D' || targetDiff.status === 'D') {
      return 'high';
    }
    if (sourceDiff.status === 'R' || targetDiff.status === 'R') {
      return 'high';
    }
    return 'low';
  }

  private toCandidateView(candidate: DetectedConflictCandidate): MergeConflictCandidateView {
    return {
      analysisId: candidate.analysisId,
      candidateId: candidate.candidateId,
      filePath: candidate.filePath,
      lineStart: candidate.lineStart,
      lineEnd: candidate.lineEnd,
      severity: candidate.severity,
      reason: candidate.reason,
      suggestion: candidate.suggestion,
      sourceExcerpt: candidate.sourceExcerpt,
      targetExcerpt: candidate.targetExcerpt,
      baseExcerpt: candidate.baseExcerpt,
      detectedBy: candidate.detectedBy,
      riskLevel: candidate.riskLevel,
      conflictKind: candidate.conflictKind,
      conflictRegions: candidate.conflictRegions,
      sourceFullContent: candidate.sourceFullContent,
      targetFullContent: candidate.targetFullContent,
      baseFullContent: candidate.baseFullContent,
    };
  }

  private toCandidateViewFromRow(
    row: ConflictCandidateRow,
    artifact?: StoredArtifactCandidate,
  ): MergeConflictCandidateView {
    return {
      analysisId: row.analysis_id,
      candidateId: row.candidate_id,
      filePath: row.file_path,
      lineStart: row.line_start ?? artifact?.line_start ?? 1,
      lineEnd: row.line_end ?? artifact?.line_end ?? row.line_start ?? 1,
      severity: this.severityFromConfidence(row.confidence_score),
      reason: artifact?.reason ?? '이미 저장된 병합 충돌 후보입니다.',
      suggestion: artifact?.suggestion,
      sourceExcerpt: artifact?.source_excerpt,
      targetExcerpt: artifact?.target_excerpt,
      baseExcerpt: artifact?.base_excerpt,
      detectedBy: row.detected_by,
      riskLevel: this.riskFromConfidence(row.confidence_score),
      conflictKind: artifact?.conflict_kind,
      conflictRegions: artifact?.conflict_regions,
      sourceFullContent: artifact?.source_full_content,
      targetFullContent: artifact?.target_full_content,
      baseFullContent: artifact?.base_full_content,
    };
  }

  private severityFromConfidence(confidenceScore: number | null): 'high' | 'medium' | 'low' {
    if ((confidenceScore ?? 0) >= 0.8) {
      return 'high';
    }
    if ((confidenceScore ?? 0) >= 0.5) {
      return 'medium';
    }
    return 'low';
  }

  private riskFromConfidence(confidenceScore: number | null): 'high' | 'medium' | 'low' {
    return this.severityFromConfidence(confidenceScore);
  }

  private toAnalysisArtifact(
    context: MergeAnalysisInputContext,
    candidates: DetectedConflictCandidate[],
  ) {
    return {
      schema_version: 'merge-analysis-v2',
      analysis_id: context.analysisId,
      project_id: context.projectId,
      session_id: context.sessionId,
      source_worktree_instance_id: context.source.worktreeInstanceId,
      target_worktree_instance_id: context.target.worktreeInstanceId,
      source_branch: context.source.branchName,
      target_branch: context.target.branchName,
      merge_base: context.mergeBase,
      source_branch_tip: context.sourceBranchTip,
      target_branch_tip: context.targetBranchTip,
      related_files: context.relatedFiles,
      source_diffs: context.sourceDiffs,
      target_diffs: context.targetDiffs,
      source_diff_text: context.sourceDiffText,
      target_diff_text: context.targetDiffText,
      branch_diff_text: context.branchDiffText,
      candidates: candidates.map((candidate) => ({
        candidate_id: candidate.candidateId,
        file_path: candidate.filePath,
        line_start: candidate.lineStart,
        line_end: candidate.lineEnd,
        detected_by: candidate.detectedBy,
        confidence_score: candidate.confidenceScore,
        reason: candidate.reason,
        suggestion: candidate.suggestion,
        source_excerpt: candidate.sourceExcerpt,
        target_excerpt: candidate.targetExcerpt,
        base_excerpt: candidate.baseExcerpt,
        risk_level: candidate.riskLevel,
        conflict_kind: candidate.conflictKind,
        conflict_regions: candidate.conflictRegions,
        source_full_content: candidate.sourceFullContent,
        target_full_content: candidate.targetFullContent,
        base_full_content: candidate.baseFullContent,
      })),
      created_at: new Date().toISOString(),
    };
  }
}

function hash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}
