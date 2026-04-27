import { GitClient } from '../ports/GitClient';
import { ConflictCandidate, DiffResult } from '@gitcat/shared-types';
import * as crypto from 'crypto';

/**
 * 3-Way Diff 기반 충돌 후보(ConflictCandidate) 추출기
 * I-06-analyze 규격을 구현합니다.
 */
export class ConflictAnalyzer {
  constructor(private readonly gitClient: GitClient) { }

  /**
   * 두 브랜치 간의 충돌 가능성이 있는 구간을 분석하여 ConflictCandidate 배열을 반환합니다.
   * @spec I-06-analyze: analyze(source: string, target: string): Promise<ConflictCandidate[]>
   * @param source 소스 (현재 작업 중인) 브랜치
   * @param target 타겟 (병합 대상) 브랜치
   * @param analysisId 병합 분석 ID (생성하여 주입받거나 내부 생성)
   * @param repoPath 워크스페이스 경로
   */
  async analyze(source: string, target: string, analysisId: string, repoPath?: string): Promise<ConflictCandidate[]> {
    // 1. 공통 조상(Merge Base) 찾기
    const mergeBase = await this.gitClient.getMergeBase(source, target, repoPath);
    if (!mergeBase) {
      throw new Error('[ConflictAnalyzer] Merge base를 찾을 수 없습니다.');
    }

    // 2. Base 기준 각 브랜치의 변경 사항(Diff) 추출
    const sourceDiffs = await this.gitClient.getDiff(mergeBase, source, repoPath);
    const targetDiffs = await this.gitClient.getDiff(mergeBase, target, repoPath);

    // 3. 두 브랜치 모두에서 변경된 파일(교집합) 찾기
    const sourceFiles = new Map(sourceDiffs.map(d => [d.file_path, d]));
    const targetFiles = new Map(targetDiffs.map(d => [d.file_path, d]));

    const candidates: ConflictCandidate[] = [];

    for (const [filePath, sourceDiff] of sourceFiles.entries()) {
      if (targetFiles.has(filePath)) {
        const targetDiff = targetFiles.get(filePath)!;

        // 4. 동일 파일 내 겹치거나 인접한(Adjacent) 변경 구간 식별
        const conflicts = await this.detectLineConflicts(sourceDiff, targetDiff, filePath, source, target, mergeBase, analysisId, repoPath);
        candidates.push(...conflicts);
      }
    }

    // 5. 추출된 충돌 후보 반환
    return candidates;
  }

  /**
   * 특정 파일 내에서 두 Diff 뭉치(Hunk)를 비교하여 겹치는 구간을 충돌로 간주하고 추출합니다.
   */
  private async detectLineConflicts(
    sourceDiff: DiffResult,
    targetDiff: DiffResult,
    filePath: string,
    sourceRef: string,
    targetRef: string,
    baseRef: string,
    analysisId: string,
    repoPath?: string
  ): Promise<ConflictCandidate[]> {
    const candidates: ConflictCandidate[] = [];

    // Hunk 파싱을 통해 변경된 라인 범위(start, end)를 추출해야 하나,
    // 현재 구현에서는 간소화를 위해 파일 단위 겹침을 우선 하나의 거대한 덩어리로 가져오거나,
    // 정규식을 통해 @@ -start,count +start,count @@ 에서 범위를 추출합니다.
    const sourceRanges = this.extractLineRanges(sourceDiff.hunks);
    const targetRanges = this.extractLineRanges(targetDiff.hunks);

    for (const sRange of sourceRanges) {
      for (const tRange of targetRanges) {
        // 라인 겹침(Overlap) 또는 인접(Adjacent) 판별 (간단히 ±3 라인 여유)
        if (this.isOverlappingOrAdjacent(sRange, tRange, 3)) {
          // 겹치는 전체 범위 계산
          const conflictStart = Math.min(sRange.start, tRange.start);
          const conflictEnd = Math.max(sRange.end, tRange.end);

          // Base, Source, Target 코드 내용 조회
          const sourceCode = await this.gitClient.getFileContent(filePath, sourceRef, repoPath);
          const targetCode = await this.gitClient.getFileContent(filePath, targetRef, repoPath);
          const baseCode = await this.gitClient.getFileContent(filePath, baseRef, repoPath);

          // (응용) 전체 코드 대신, 해당 라인 범위만 잘라서 넣을 수도 있습니다.
          // 편의상 전체 코드를 넣고 AI 모델이 라인 넘버를 참고하도록 구성하거나,
          // 잘라내는 유틸리티 로직을 여기에 추가할 수 있습니다.
          const snippetSource = this.extractCodeSnippet(sourceCode, conflictStart, conflictEnd);
          const snippetTarget = this.extractCodeSnippet(targetCode, conflictStart, conflictEnd);
          const snippetBase = this.extractCodeSnippet(baseCode, conflictStart, conflictEnd);

          candidates.push({
            candidate_id: this.generateId('cc_'),
            analysis_id: analysisId,
            file_path: filePath,
            line_start: conflictStart,
            line_end: conflictEnd,
            source_code: snippetSource,
            target_code: snippetTarget,
            base_code: snippetBase,
            conflict_type: 'same_region', // 또는 인접시 'adjacent_change'
            reason_summary: '동일 시그니처 또는 로직 구간 동시 변경',
            detected_by: 'diff', // DetectionMethodEnum.diff 에 대응
          });
        }
      }
    }

    return candidates;
  }

  /**
   * @@ -a,b +c,d @@ 형태의 Hunk 헤더에서 기준 브랜치(Merge Base) 시점의 변경 라인 범위를 추출합니다.
   * 비교는 Base 라인을 기준으로 수행해야 동기화가 맞습니다.
   */
  private extractLineRanges(hunks: string[]): { start: number; end: number }[] {
    const ranges: { start: number; end: number }[] = [];
    const hunkHeaderRegex = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/;

    for (const hunk of hunks) {
      const firstLine = hunk.split('\n')[0];
      const match = firstLine.match(hunkHeaderRegex);
      if (match) {
        const start = parseInt(match[1], 10);
        // Hunk 본문 내용에서 원래 줄(기본적으로 삭제 또는 유지된 줄)의 개수를 셉니다.
        const originalLineCount = hunk.split('\n').filter(line => line.startsWith(' ') || line.startsWith('-')).length;
        ranges.push({ start, end: start + originalLineCount - 1 });
      }
    }
    return ranges;
  }

  /**
   * 범위가 겹치거나 지정된 margin 이내로 인접한지 확인합니다.
   */
  private isOverlappingOrAdjacent(r1: { start: number; end: number }, r2: { start: number; end: number }, margin: number = 0): boolean {
    return Math.max(r1.start, r2.start) <= Math.min(r1.end, r2.end) + margin;
  }

  /**
   * 전체 코드 문자열에서 특정 라인 범위(1-based)만 잘라 반환합니다.
   */
  private extractCodeSnippet(fullCode: string, startLine: number, endLine: number): string {
    if (!fullCode) return '';
    const codeLines = fullCode.split('\n');
    // startLine/endLine은 1-based 인덱스
    const startIdx = Math.max(0, startLine - 1);
    const endIdx = Math.min(codeLines.length, endLine);
    return codeLines.slice(startIdx, endIdx).join('\n');
  }

  /**
   * 간단한 고유 ID 생성 (UUID 대용)
   */
  private generateId(prefix: string): string {
    return `${prefix}${crypto.randomBytes(8).toString('hex')}`;
  }
}
