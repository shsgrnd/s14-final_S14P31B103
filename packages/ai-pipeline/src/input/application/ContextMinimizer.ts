import { ConflictCandidate } from '@gitcat/shared-types';

/**
 * AI 컨텍스트 최적화를 위해 코드 스니펫을 지능적으로 절단(Truncation)하는 클래스입니다.
 */
export class ContextMinimizer {
  /**
   * 충돌 후보의 소스/타겟 코드를 지능적으로 절단하여 반환합니다.
   * 충돌이 발생한 지점을 중심으로 위아래 windowSize만큼의 라인만 남깁니다.
   * 
   * @param candidate 절단할 충돌 후보 객체
   * @param windowSize 충돌 지점 주변에 유지할 라인 수 (기본값: 20줄)
   */
  public minimizeCandidate(candidate: ConflictCandidate, windowSize: number = 20): ConflictCandidate {
    const truncatedSource = this.truncateCode(candidate.source_code, candidate.line_start, candidate.line_end, windowSize);
    const truncatedTarget = this.truncateCode(candidate.target_code, candidate.line_start, candidate.line_end, windowSize);

    return {
      ...candidate,
      source_code: truncatedSource,
      target_code: truncatedTarget
    };
  }

  /**
   * 실제 문자열 절단 로직
   */
  private truncateCode(code: string, startLine: number, endLine: number, window: number): string {
    const lines = code.split('\n');
    const totalLines = lines.length;

    // 만약 전체 코드가 윈도우 크기보다 작으면 절단하지 않음
    if (totalLines <= (endLine - startLine + 1) + (window * 2)) {
      return code;
    }

    const startIdx = Math.max(0, startLine - window - 1);
    const endIdx = Math.min(totalLines - 1, endLine + window - 1);

    const resultLines: string[] = [];

    // 1. 위쪽 생략 표시
    if (startIdx > 0) {
      resultLines.push(`// ... (위쪽 ${startIdx}줄 생략됨) ...`);
    }

    // 2. 핵심 컨텍스트 추출
    resultLines.push(...lines.slice(startIdx, endIdx + 1));

    // 3. 아래쪽 생략 표시
    if (endIdx < totalLines - 1) {
      const omittedCount = totalLines - 1 - endIdx;
      resultLines.push(`// ... (아래쪽 ${omittedCount}줄 생략됨) ...`);
    }

    return resultLines.join('\n');
  }
}
