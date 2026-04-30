import { GitClient } from '../ports/GitClient';
import { ConflictCandidate, DiffResult } from '@gitcat/shared-types';
import * as crypto from 'crypto';
import { AstAnalyzer } from './AstAnalyzer';
import * as path from 'path';

/** AST 분석 지원 대상 파일 확장자 목록 */
const AST_SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * 공유 모듈로 간주하는 디렉토리 패턴 목록
 * 이 경로에 속하는 파일이 변경된 경우 shared_module_impact 타입으로 상향 분류됩니다.
 */
const SHARED_MODULE_PATTERNS = [
  /\/shared\//i,
  /\/common\//i,
  /\/utils\//i,
  /\/helpers\//i,
  /\/lib\//i,
  /\/core\//i,
  /\/types\//i,
  /\/dto\//i,
  /\/enums\//i,
  /\/interfaces\//i,
];

/**
 * 데이터 구조 변경(data_structure_change) 패턴 — 타입/인터페이스/DTO 파일
 */
const DATA_STRUCTURE_FILE_PATTERNS = [
  /\.dto\.(ts|js)$/i,
  /\.type\.(ts|js)$/i,
  /\/types\//i,
  /\/interfaces\//i,
  /\/enums\//i,
  /schema\.(ts|js)$/i,
  /interface\.(ts|js)$/i,
];

/**
 * 3-Way Diff + AST 기반 충돌 후보(ConflictCandidate) 추출기
 * I-06-analyze 규격을 구현합니다.
 *
 * 감지 전략:
 *  1. (Line-based) 수정된 라인 범위가 서로 겹치거나 인접하면 충돌 후보 생성
 *     - conflict_type: same_region | adjacent_change | shared_module_impact | data_structure_change
 *  2. (AST-based) JS/TS 파일에 한해, 서로 다른 라인을 건드렸더라도
 *     같은 함수·메서드·클래스를 동시에 수정한 경우 충돌 후보 추가 생성
 *     - conflict_type: signature_change | same_region
 *
 * risk_level 산정 기준:
 *  - critical : 공유 모듈 or 데이터 구조 변경 (파급 범위 넓음)
 *  - high     : signature_change (함수 시그니처 변동 → 의존 코드 전파 가능성)
 *  - medium   : same_region (직접 겹침)
 *  - low      : adjacent_change (인접하지만 직접 겹침 없음)
 */
export class ConflictAnalyzer {
  /** AST 분석을 담당하는 유틸리티 (TypeScript Compiler API 래퍼) */
  private readonly astAnalyzer = new AstAnalyzer();

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

        // 4-A. 라인 기반(Line-based) 충돌 후보 추출 (모든 파일 대상)
        const lineConflicts = await this.detectLineConflicts(
          sourceDiff, targetDiff, filePath, source, target, mergeBase, analysisId, repoPath
        );
        candidates.push(...lineConflicts);

        // 4-B. AST 기반 구조적 충돌 후보 추출 (JS/TS 파일만)
        if (this.isSupportedForAst(filePath)) {
          const astConflicts = await this.detectAstConflicts(
            sourceDiff, targetDiff, filePath, source, target, mergeBase, analysisId, repoPath
          );
          // 라인 기반에서 이미 탐지된 구간과 중복되지 않는 경우만 추가합니다.
          for (const astConflict of astConflicts) {
            const alreadyCovered = lineConflicts.some(
              (lc) => lc.line_start <= astConflict.line_start && astConflict.line_end <= lc.line_end
            );
            if (!alreadyCovered) candidates.push(astConflict);
          }
        }
      }
    }

    // 5. 추출된 충돌 후보 반환
    return candidates;
  }

  /**
   * 파일 확장자가 AST 분석을 지원하는 형식인지 확인합니다.
   * JS/TS 계열 파일(.ts .tsx .js .jsx)에 한해 AST 파싱을 적용합니다.
   */
  private isSupportedForAst(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return AST_SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * [Step 4-A] 라인 기반(Line-based) 충돌 감지.
   * @@ 헤더에서 변경 라인 범위를 추출하고, 두 브랜치의 범위가 겹치거나 인접하면 충돌 후보로 등록합니다.
   * detected_by: 'diff'
   *
   * conflict_type 분류 우선순위:
   *  1. data_structure_change — 타입/DTO/인터페이스 파일
   *  2. shared_module_impact  — 공유 모듈 경로
   *  3. same_region           — 직접 라인 겹침
   *  4. adjacent_change       — 인접(±3줄) 변경
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

    const sourceRanges = this.extractLineRanges(sourceDiff.hunks);
    const targetRanges = this.extractLineRanges(targetDiff.hunks);

    for (const sRange of sourceRanges) {
      for (const tRange of targetRanges) {
        // 라인 겹침(Overlap) 또는 인접(Adjacent) 판별 (±3 라인 여유)
        if (this.isOverlappingOrAdjacent(sRange, tRange, 3)) {
          const conflictStart = Math.min(sRange.start, tRange.start);
          const conflictEnd = Math.max(sRange.end, tRange.end);

          const sourceCode = await this.gitClient.getFileContent(filePath, sourceRef, repoPath);
          const targetCode = await this.gitClient.getFileContent(filePath, targetRef, repoPath);
          const baseCode = await this.gitClient.getFileContent(filePath, baseRef, repoPath);

          const isDirectOverlap = this.isOverlappingOrAdjacent(sRange, tRange, 0);
          const conflictType = this.classifyLineConflictType(filePath, isDirectOverlap);
          const riskLevel = this.assessRiskLevel(conflictType);
          const reasonSummary = this.buildLineReasonSummary(
            conflictType, filePath, sRange, tRange, sourceRef, targetRef
          );

          candidates.push({
            candidate_id: this.generateId('cc_'),
            analysis_id: analysisId,
            file_path: filePath,
            line_start: conflictStart,
            line_end: conflictEnd,
            source_code: this.extractCodeSnippet(sourceCode, conflictStart, conflictEnd),
            target_code: this.extractCodeSnippet(targetCode, conflictStart, conflictEnd),
            base_code: this.extractCodeSnippet(baseCode, conflictStart, conflictEnd),
            conflict_type: conflictType,
            risk_level: riskLevel,
            reason_summary: reasonSummary,
            detected_by: 'diff',
          });
        }
      }
    }

    return candidates;
  }

  /**
   * [Step 4-B] AST 기반 구조적 충돌 감지.
   * 라인이 겹치지 않더라도, 두 브랜치가 같은 함수/메서드/클래스를 수정했다면 충돌 후보로 등록합니다.
   * detected_by: 'ast'
   *
   * conflict_type 분류:
   *  - signature_change : 두 브랜치가 같은 함수/메서드의 시그니처 부분(앞부분)을 건드린 경우
   *  - same_region      : 같은 논리 블록 내 일반 변경 충돌
   */
  private async detectAstConflicts(
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

    // Base 시점의 파일 내용을 기준으로 AST를 파싱합니다.
    const baseCode = await this.gitClient.getFileContent(filePath, baseRef, repoPath);
    if (!baseCode) return []; // Base에 파일이 없으면 신규 파일이므로 AST 분석 불필요

    // Base 코드를 AST로 분석하여 모든 논리 블록을 추출합니다.
    const blocks = this.astAnalyzer.extractBlocks(baseCode, filePath);
    if (blocks.length === 0) return []; // 분석 가능한 블록이 없으면 종료

    const sourceRanges = this.extractLineRanges(sourceDiff.hunks);
    const targetRanges = this.extractLineRanges(targetDiff.hunks);

    // Source와 Target의 모든 변경 라인 조합을 비교합니다.
    for (const sRange of sourceRanges) {
      for (const tRange of targetRanges) {
        // 이미 라인 기반에서 겹치는 구간은 detectLineConflicts에서 처리했으므로 제외합니다.
        if (this.isOverlappingOrAdjacent(sRange, tRange, 3)) continue;

        // Source 변경 라인의 '중간 지점'이 어느 논리 블록에 속하는지 확인합니다.
        const sMidLine = Math.floor((sRange.start + sRange.end) / 2);
        const tMidLine = Math.floor((tRange.start + tRange.end) / 2);

        // 두 변경 지점이 같은 논리 블록(함수/클래스)에 속하면 구조적 충돌로 판단합니다.
        if (this.astAnalyzer.isSameLogicalBlock(blocks, sMidLine, tMidLine)) {
          // 해당 논리 블록의 전체 범위를 충돌 구간으로 사용합니다.
          const containingBlock = this.astAnalyzer.findBlocksAtLine(blocks, sMidLine)
            .at(-1)!; // 가장 안쪽(narrowest) 블록

          const conflictStart = containingBlock.startLine;
          const conflictEnd = containingBlock.endLine;

          const sourceCode = await this.gitClient.getFileContent(filePath, sourceRef, repoPath);
          const targetCode = await this.gitClient.getFileContent(filePath, targetRef, repoPath);

          // 시그니처 변경 여부 판별: 두 브랜치 중 하나라도 블록의 첫 3줄 이내를 건드렸다면 signature_change
          const isSignatureChange = this.astAnalyzer.isSignatureModified(
            containingBlock, sRange, tRange
          );

          const conflictType = isSignatureChange ? 'signature_change' : 'same_region';
          const riskLevel = this.assessRiskLevel(conflictType);
          const reasonSummary = this.buildAstReasonSummary(
            conflictType, containingBlock, filePath, sourceRef, targetRef
          );

          candidates.push({
            candidate_id: this.generateId('ca_'), // 'ca_' prefix로 AST 탐지임을 명시
            analysis_id: analysisId,
            file_path: filePath,
            line_start: conflictStart,
            line_end: conflictEnd,
            source_code: this.extractCodeSnippet(sourceCode, conflictStart, conflictEnd),
            target_code: this.extractCodeSnippet(targetCode, conflictStart, conflictEnd),
            base_code: this.extractCodeSnippet(baseCode, conflictStart, conflictEnd),
            conflict_type: conflictType,
            risk_level: riskLevel,
            reason_summary: reasonSummary,
            detected_by: 'ast',
          });
        }
      }
    }

    return candidates;
  }

  // ============================================================
  // ▼ conflict_type 분류 로직
  // ============================================================

  /**
   * 라인 기반 충돌에 대해 conflict_type을 분류합니다.
   * 우선순위: data_structure_change > shared_module_impact > same_region > adjacent_change
   */
  private classifyLineConflictType(
    filePath: string,
    isDirectOverlap: boolean
  ): ConflictCandidate['conflict_type'] {
    if (this.isDataStructureFile(filePath)) {
      return 'data_structure_change';
    }
    if (this.isSharedModule(filePath)) {
      return 'shared_module_impact';
    }
    return isDirectOverlap ? 'same_region' : 'adjacent_change';
  }

  /**
   * 파일 경로가 데이터 구조 파일(DTO/타입/인터페이스/스키마 등)인지 판별합니다.
   */
  private isDataStructureFile(filePath: string): boolean {
    return DATA_STRUCTURE_FILE_PATTERNS.some(pattern => pattern.test(filePath));
  }

  /**
   * 파일 경로가 공유 모듈 디렉토리에 속하는지 판별합니다.
   */
  private isSharedModule(filePath: string): boolean {
    return SHARED_MODULE_PATTERNS.some(pattern => pattern.test(filePath));
  }

  // ============================================================
  // ▼ risk_level 산정 로직
  // ============================================================

  /**
   * conflict_type을 기반으로 risk_level을 자동 산정합니다.
   *
   * | conflict_type          | risk_level |
   * |------------------------|------------|
   * | data_structure_change  | critical   |
   * | shared_module_impact   | critical   |
   * | signature_change       | high       |
   * | same_region            | medium     |
   * | adjacent_change        | low        |
   */
  private assessRiskLevel(conflictType: ConflictCandidate['conflict_type']): ConflictCandidate['risk_level'] {
    switch (conflictType) {
      case 'data_structure_change':
      case 'shared_module_impact':
        return 'critical';
      case 'signature_change':
        return 'high';
      case 'same_region':
        return 'medium';
      case 'adjacent_change':
      default:
        return 'low';
    }
  }

  // ============================================================
  // ▼ reason_summary 자동 생성 로직
  // ============================================================

  /**
   * 라인 기반 충돌에 대한 맥락 기반 reason_summary를 생성합니다.
   */
  private buildLineReasonSummary(
    conflictType: ConflictCandidate['conflict_type'],
    filePath: string,
    sRange: { start: number; end: number },
    tRange: { start: number; end: number },
    sourceRef: string,
    targetRef: string
  ): string {
    const fileName = path.basename(filePath);
    const sourceLines = `L${sRange.start}–${sRange.end}`;
    const targetLines = `L${tRange.start}–${tRange.end}`;

    switch (conflictType) {
      case 'data_structure_change':
        return `데이터 구조 파일(${fileName})이 두 브랜치에서 동시에 수정됨 — `
          + `${sourceRef} 브랜치(${sourceLines})와 ${targetRef} 브랜치(${targetLines})의 타입/스키마 변경이 충돌할 수 있음`;

      case 'shared_module_impact':
        return `공유 모듈(${fileName})이 두 브랜치에서 동시에 변경됨 — `
          + `${sourceRef}(${sourceLines})와 ${targetRef}(${targetLines})의 수정이 의존 코드 전반에 영향을 줄 수 있음`;

      case 'same_region':
        return `동일 코드 구간(${fileName} ${sourceLines} ↔ ${targetLines})을 두 브랜치가 동시에 수정함 — `
          + `직접 라인 충돌이 발생할 가능성이 높음`;

      case 'adjacent_change':
        return `인접 코드 구간(${fileName} ${sourceLines} ↔ ${targetLines})을 두 브랜치가 각각 수정함 — `
          + `직접 겹침은 없지만 컨텍스트 의존 충돌 가능성 있음`;

      default:
        return `${fileName}의 ${sourceLines}와 ${targetLines} 구간에서 두 브랜치가 동시에 변경 발생`;
    }
  }

  /**
   * AST 기반 충돌에 대한 맥락 기반 reason_summary를 생성합니다.
   */
  private buildAstReasonSummary(
    conflictType: ConflictCandidate['conflict_type'],
    containingBlock: { kind: string; name: string; startLine: number; endLine: number },
    filePath: string,
    sourceRef: string,
    targetRef: string
  ): string {
    const fileName = path.basename(filePath);
    const blockLabel = `${containingBlock.kind}(${containingBlock.name})`;

    if (conflictType === 'signature_change') {
      return `${fileName}의 ${blockLabel} 시그니처 부분을 두 브랜치가 동시에 수정함 — `
        + `${sourceRef}와 ${targetRef}의 함수 선언 변경이 호출 측 코드에 전파될 수 있음`;
    }

    return `${fileName}의 동일 논리 블록(${blockLabel})을 두 브랜치가 서로 다른 위치에서 수정함 — `
      + `${sourceRef}와 ${targetRef}의 변경이 하나의 함수 컨텍스트 안에서 충돌을 유발할 수 있음`;
  }

  // ============================================================
  // ▼ 공통 유틸리티
  // ============================================================

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
