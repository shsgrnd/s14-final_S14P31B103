import * as fs from 'fs/promises';
import * as path from 'path';
import { GitClient } from '../ports/GitClient';

// ============================================================
// 상수 정의
// ============================================================

const DIFF_BASE_DIR = '.vscode/gitcat/snapshots';
const DIFF_FILE_NAME = 'working.diff';
const MAX_DIFF_LINES = 3000;
const EMPTY_DIFF_CONTENT = '# No working tree changes detected at the time of analysis.\n';

// ============================================================
// 타입 정의
// ============================================================

export interface WorkingTreeDiffResult {
  /** AI payload에 들어가는 논리 ref 문자열 */
  ref: string;
  /** 로컬 디스크의 절대 경로 */
  filePath: string;
  /** 저장된 diff 줄 수 */
  lineCount: number;
  /** 원본이 MAX_DIFF_LINES를 초과해 잘렸으면 true */
  truncated: boolean;
}

export class WorkingTreeDiffManager {
  constructor(
    /** Git 명령을 실행할 클라이언트 */
    private readonly gitClient: GitClient
  ) { }

  /**
   * Git에서 현재 작업 트리의 diff를 가져와 파일로 저장한 뒤 ref를 반환합니다.
   *
   * @param sessionId   현재 세션 ID (예: "ais_20260430_001"). 저장 폴더명으로 사용됩니다.
   * @param workspaceRoot VS Code 워크스페이스 루트 절대 경로 (예: "/home/user/myproject")
   * @param repoPath    Git 저장소 경로. 보통 workspaceRoot와 같지만 다를 수 있습니다.
   */
  async saveDiffAndGetRef(
    sessionId: string,
    workspaceRoot: string,
    repoPath?: string
  ): Promise<WorkingTreeDiffResult> {
    console.log(`[WorkingTreeDiffManager] diff 수집 시작 — session: ${sessionId}`);

    const rawDiff = await this.gitClient.getWorkingTreeDiff(repoPath);

    const { content, truncated, lineCount } = this.truncateDiff(rawDiff);

    const filePath = await this.writeToFile(workspaceRoot, sessionId, content);
    const ref = `diff://local/${sessionId}/${DIFF_FILE_NAME}`;

    if (truncated) {
      console.warn(
        `[WorkingTreeDiffManager] diff가 ${MAX_DIFF_LINES}줄 초과하여 잘렸습니다. ` +
        `최종 저장 줄 수: ${lineCount}줄`
      );
    } else {
      console.log(`[WorkingTreeDiffManager] diff 저장 완료 — ${lineCount}줄, 경로: ${filePath}`);
    }

    return { ref, filePath, lineCount, truncated };
  }

  // ============================================================
  // ▼ 내부 유틸리티 메서드
  // ============================================================

  /**
   * diff 텍스트를 최대 MAX_DIFF_LINES 줄로 잘라냅니다.
   *
   * @param rawDiff 원본 diff 텍스트 (빈 문자열 가능)
   * @returns 잘라낸 결과 + 관련 메타데이터
   */
  private truncateDiff(rawDiff: string): {
    content: string;
    truncated: boolean;
    lineCount: number;
  } {
    // diff가 완전히 비어 있는 경우: 변경 없음을 명시하는 기본 내용으로 대체합니다.
    if (!rawDiff || rawDiff.trim().length === 0) {
      return {
        content: EMPTY_DIFF_CONTENT,
        truncated: false,
        lineCount: 1,
      };
    }

    const lines = rawDiff.split('\n');

    // 줄 수가 제한 이내이면 그대로 씁니다.
    if (lines.length <= MAX_DIFF_LINES) {
      return {
        content: rawDiff,
        truncated: false,
        lineCount: lines.length,
      };
    }

    // 줄 수가 초과하면 앞 MAX_DIFF_LINES 줄만 남기고,
    // 마지막에 잘렸음을 알리는 주석 2줄을 추가합니다.
    const truncatedLines = lines.slice(0, MAX_DIFF_LINES);
    const omittedCount = lines.length - MAX_DIFF_LINES;
    truncatedLines.push(
      '',
      `# [GitCat] Working diff truncated: ${omittedCount} lines omitted (total was ${lines.length} lines).`,
      `# [GitCat] Only the first ${MAX_DIFF_LINES} lines are included for AI context.`
    );

    return {
      content: truncatedLines.join('\n'),
      truncated: true,
      lineCount: MAX_DIFF_LINES,
    };
  }

  /**
   * diff 내용을 로컬 파일 시스템에 저장하고, 저장된 파일의 절대 경로를 반환합니다.
   * @param workspaceRoot 워크스페이스 루트 절대 경로
   * @param sessionId     세션 ID (폴더명으로 사용)
   * @param content       저장할 diff 내용 문자열
   * @returns 저장된 파일의 절대 경로
   */
  private async writeToFile(
    workspaceRoot: string,
    sessionId: string,
    content: string
  ): Promise<string> {
    // 저장 디렉토리 절대 경로를 계산합니다.
    // path.join은 OS 구분자(/ 또는 \)를 자동으로 처리해 줍니다.
    const targetDir = path.join(workspaceRoot, DIFF_BASE_DIR, sessionId);
    const targetPath = path.join(targetDir, DIFF_FILE_NAME);

    // 폴더가 없으면 자동으로 만듭니다.
    // { recursive: true } 덕분에 중간 폴더가 없어도 오류가 나지 않습니다.
    await fs.mkdir(targetDir, { recursive: true });

    // 파일을 UTF-8 인코딩으로 씁니다.
    // 이미 파일이 있으면 덮어쓰기합니다(동일 세션 재실행 시 최신 diff로 갱신).
    await fs.writeFile(targetPath, content, 'utf-8');

    return targetPath;
  }
}
