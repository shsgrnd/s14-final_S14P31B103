import * as vscode from 'vscode';

/**
 * VS Code의 텍스트 변경 이벤트를 분석하여,
 * 해당 변경이 사용자의 수동 편집인지 AI(외부 도구)에 의한 대량 편집인지 추정합니다.
 */
export class AiChangeDetector {
  private lastChangeTime = 0;
  private readonly AI_SCORE_THRESHOLD = 70;

  constructor() { }

  /**
   * 텍스트 변경 이벤트를 분석하여 AI성 대량 변경인지 확인합니다.
   * @param event 문서 변경 이벤트
   * @returns AI 변경으로 추정되면 true
   */
  public async analyzeChange(event: vscode.TextDocumentChangeEvent): Promise<boolean> {
    if (event.contentChanges.length === 0) {
      return false;
    }

    const now = Date.now();
    const timeSinceLastChange = this.lastChangeTime === 0 ? 9999 : now - this.lastChangeTime;
    this.lastChangeTime = now;

    let maxLinesAddedOrRemoved = 0;
    let insertedText = '';

    for (const change of event.contentChanges) {
      // 삽입된 줄 수 (개행 문자 수)
      const linesAdded = change.text.split('\n').length - 1;
      // 삭제되거나 대체된 줄 수
      const linesRemoved = change.range.end.line - change.range.start.line;

      const linesChanged = Math.max(linesAdded, linesRemoved);
      if (linesChanged > maxLinesAddedOrRemoved) {
        maxLinesAddedOrRemoved = linesChanged;
      }

      if (change.text) {
        insertedText += change.text;
      }
    }

    // 최소 2줄 이상의 변경(삽입 또는 삭제/수정)이 일어나야 AI 변경 후보로 올림
    if (maxLinesAddedOrRemoved < 2) {
      return false;
    }

    let score = 0;

    // 1. 라인 변경 기본 점수 (2줄 이상)
    score += 40;

    // 2. 속도 기반 점수
    // 사용자가 2줄 이상의 내용을 작성/수정했는데 마지막 키 입력 이후 시간이 매우 짧다면 점수 부여
    // (일반적인 타이핑으로는 200ms 내에 2줄을 쓰기 불가능함)
    if (timeSinceLastChange < 200) {
      score += 20;
    }

    // 3. 클립보드 텍스트 비교 (성능 및 경고 방지를 위해 대량 변경 발생 시에만 수행)
    if (insertedText.length > 0) {
      try {
        const clipboardText = await vscode.env.clipboard.readText();
        // 붙여넣기(사용자 Ctrl+V)인 경우
        if (clipboardText && insertedText === clipboardText) {
          // 명백한 사용자의 붙여넣기이므로 점수를 대폭 차감
          score -= 50;
        } else {
          // 클립보드와 불일치하는 대용량 텍스트 삽입 -> AI일 확률이 매우 높음
          score += 30;
        }
      } catch (e) {
        console.warn('GitCat AiChangeDetector: Failed to read clipboard', e);
      }
    } else {
      // 텍스트 삽입 없이 대량의 코드 라인이 삭제된 경우 (AI의 대량 삭제 등)
      score += 10;
    }

    return score >= this.AI_SCORE_THRESHOLD;
  }
}
