import { createHash } from 'crypto';
import type { DiffResult } from '@gitcat/git-core';
import type {
  AnalyzeConflictRequest,
  ConflictCandidateRow,
  MergeConflictCandidateView,
} from '@gitcat/shared-types';
import type { MergeRepositoryBundle } from '../../storage/interfaces';
import {
  MergeAnalysisInputContext,
  MergeInputAssembler,
} from './MergeInputAssembler';
import { MergeAnalysisArtifactStore } from './MergeAnalysisArtifactStore';

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
}

interface DiffHunkSummary {
  lineStart: number;
  lineEnd: number;
  excerpt: string;
}

interface HunkOverlapSummary {
  lineStart: number;
  lineEnd: number;
  sourceExcerpt?: string;
  targetExcerpt?: string;
}

/**
 * ANALYZE_CONFLICT 요청을 실제 병합 분석 흐름으로 연결합니다.
 *
 * 현재 MVP에서는 공통 조상 이후 source/target 양쪽에서 같은 파일이 바뀐 경우를 diff 기반 후보로 탐지합니다.
 * AST 기반 정밀 분석은 이후 단계에서 이 서비스의 detectCandidates 흐름에 추가합니다.
 */
export class MergeConflictAnalysisService {
  constructor(
    private readonly assembler: MergeInputAssembler,
    private readonly repositories: Pick<
      MergeRepositoryBundle,
      'mergeAnalyses' | 'conflictCandidates'
    >,
    private readonly artifactStore: MergeAnalysisArtifactStore,
  ) {}

  async analyze(request: AnalyzeConflictRequest): Promise<MergeConflictAnalysisResult> {
    const context = await this.assembler.buildAnalysisInput({
      source: request.source,
      target: request.target,
      sessionId: request.sessionId,
    });

    const existing = await this.repositories.mergeAnalyses.findById(context.analysisId);
    if (existing?.status === 'completed') {
      const rows = await this.repositories.conflictCandidates.listByAnalysis(context.analysisId);

      // artifact JSON에서 excerpt 등 풍부한 데이터를 복원 (DB에는 최소 데이터만 저장되어 있음)
      type ArtifactCandidate = {
        candidate_id: string;
        source_excerpt?: string;
        target_excerpt?: string;
        reason?: string;
        suggestion?: string;
      };
      const artifactMap = new Map<string, ArtifactCandidate>();
      try {
        const artifact = await this.artifactStore.readAnalysis<{
          candidates?: ArtifactCandidate[];
        }>(context.repoRoot, context.analysisId);
        for (const c of artifact.candidates ?? []) {
          artifactMap.set(c.candidate_id, c);
        }
      } catch {
        // artifact 파일이 없으면 DB 데이터만 사용
      }

      return {
        analysisId: context.analysisId,
        artifactPath: existing.analysis_artifact_path,
        candidates: rows.map((row) =>
          this.toCandidateViewFromRow(row, artifactMap.get(row.candidate_id)),
        ),
      };
    }

    if (!existing) {
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
      const candidates = this.detectCandidates(context);
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

  private detectCandidates(context: MergeAnalysisInputContext): DetectedConflictCandidate[] {
    const sourceDiffs = this.toDiffMap(context.sourceDiffs);
    const targetDiffs = this.toDiffMap(context.targetDiffs);
    const sourceHunks = this.parseDiffHunks(context.sourceDiffText);
    const targetHunks = this.parseDiffHunks(context.targetDiffText);
    const candidates: DetectedConflictCandidate[] = [];

    for (const [filePath, sourceDiff] of sourceDiffs) {
      const targetDiff = targetDiffs.get(filePath);
      if (!targetDiff || !this.shouldAnalyzeFile(filePath)) {
        continue;
      }

      const overlap = this.findFirstHunkOverlap(
        sourceHunks.get(filePath) ?? [],
        targetHunks.get(filePath) ?? [],
      );
      const fallbackHunk = (sourceHunks.get(filePath) ?? targetHunks.get(filePath) ?? [])[0];
      const lineStart = overlap?.lineStart ?? fallbackHunk?.lineStart ?? 1;
      const lineEnd = overlap?.lineEnd ?? fallbackHunk?.lineEnd ?? lineStart;
      const severity = this.resolveSeverity(sourceDiff, targetDiff, overlap !== null);
      const riskLevel = severity === 'high' ? 'high' : severity === 'medium' ? 'medium' : 'low';
      const hasLineOverlap = overlap !== null;

      candidates.push({
        candidateId: `candidate_${hash(`${context.analysisId}:${filePath}`)}`,
        analysisId: context.analysisId,
        filePath,
        lineStart,
        lineEnd,
        severity,
        reason: hasLineOverlap
          ? '공통 조상 이후 source와 target 양쪽 diff hunk가 같은 라인 범위를 변경했습니다.'
          : '공통 조상 이후 source와 target 양쪽에서 같은 파일이 변경되었습니다.',
        suggestion: hasLineOverlap
          ? '겹치는 라인 범위를 우선 검토한 뒤 AI 병합 제안 단계로 넘겨야 합니다.'
          : '같은 파일 안의 변경 의도를 비교하되, 직접 라인 충돌 가능성은 낮게 봅니다.',
        sourceExcerpt: overlap?.sourceExcerpt ?? fallbackHunk?.excerpt,
        targetExcerpt: overlap?.targetExcerpt ?? fallbackHunk?.excerpt,
        detectedBy: 'diff',
        riskLevel,
        confidenceScore: hasLineOverlap ? 0.9 : severity === 'high' ? 0.85 : 0.65,
      });
    }

    return candidates.sort((a, b) => a.filePath.localeCompare(b.filePath));
  }

  private toDiffMap(diffs: DiffResult[]): Map<string, DiffResult> {
    const map = new Map<string, DiffResult>();
    for (const diff of diffs) {
      map.set(this.normalizeFilePath(diff.filePath), diff);
      if (diff.oldPath) {
        map.set(this.normalizeFilePath(diff.oldPath), diff);
      }
    }
    return map;
  }

  private parseDiffHunks(diffText: string): Map<string, DiffHunkSummary[]> {
    const result = new Map<string, DiffHunkSummary[]>();
    const lines = diffText.split(/\r?\n/);
    let currentFile: string | null = null;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (fileMatch) {
        currentFile = this.normalizeFilePath(fileMatch[2]);
        continue;
      }

      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/);
      if (!currentFile || !hunkMatch) {
        continue;
      }

      const lineStart = Number(hunkMatch[1]);
      const lineCount = Number(hunkMatch[2] ?? '1');
      const excerpt = lines.slice(index, Math.min(index + 18, lines.length)).join('\n');
      const hunks = result.get(currentFile) ?? [];
      hunks.push({
        lineStart,
        lineEnd: Math.max(lineStart, lineStart + lineCount - 1),
        excerpt,
      });
      result.set(currentFile, hunks);
    }

    return result;
  }

  private findFirstHunkOverlap(
    sourceHunks: DiffHunkSummary[],
    targetHunks: DiffHunkSummary[],
  ): HunkOverlapSummary | null {
    for (const sourceHunk of sourceHunks) {
      for (const targetHunk of targetHunks) {
        const lineStart = Math.max(sourceHunk.lineStart, targetHunk.lineStart);
        const lineEnd = Math.min(sourceHunk.lineEnd, targetHunk.lineEnd);

        if (lineStart <= lineEnd) {
          return {
            lineStart,
            lineEnd,
            sourceExcerpt: sourceHunk.excerpt,
            targetExcerpt: targetHunk.excerpt,
          };
        }
      }
    }

    return null;
  }

  private shouldAnalyzeFile(filePath: string): boolean {
    const normalized = this.normalizeFilePath(filePath);
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
  ): 'high' | 'medium' | 'low' {
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
    };
  }

  private toCandidateViewFromRow(
    row: ConflictCandidateRow,
    artifact?: {
      source_excerpt?: string;
      target_excerpt?: string;
      reason?: string;
      suggestion?: string;
    },
  ): MergeConflictCandidateView {
    return {
      analysisId: row.analysis_id,
      candidateId: row.candidate_id,
      filePath: row.file_path,
      lineStart: row.line_start ?? 1,
      lineEnd: row.line_end ?? row.line_start ?? 1,
      severity: this.severityFromConfidence(row.confidence_score),
      reason: artifact?.reason ?? '이미 저장된 병합 충돌 후보입니다.',
      suggestion: artifact?.suggestion,
      sourceExcerpt: artifact?.source_excerpt,
      targetExcerpt: artifact?.target_excerpt,
      detectedBy: row.detected_by,
      riskLevel: this.riskFromConfidence(row.confidence_score),
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
      schema_version: 'merge-analysis-v1',
      analysis_id: context.analysisId,
      project_id: context.projectId,
      session_id: context.sessionId,
      source_worktree_instance_id: context.source.worktreeInstanceId,
      target_worktree_instance_id: context.target.worktreeInstanceId,
      source_branch: context.source.branchName,
      target_branch: context.target.branchName,
      merge_base: context.mergeBase,
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
      })),
      created_at: new Date().toISOString(),
    };
  }

  private normalizeFilePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }
}

function hash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}
