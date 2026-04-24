import * as fs from 'fs/promises';
import * as path from 'path';

const GITCAT_DIR = '.vscode/gitcat';
const DIRS = ['snapshots', 'merge-sessions', 'temp'];

/**
 * 워크스페이스 내에 .vscode/gitcat/ 및 하위 필수 폴더들을 생성합니다.
 */
export async function initializeStorage(workspaceRoot: string): Promise<void> {
  const baseDir = path.join(workspaceRoot, GITCAT_DIR);
  
  // 기본 디렉터리 생성
  await fs.mkdir(baseDir, { recursive: true });

  // 하위 디렉터리 생성
  for (const dir of DIRS) {
    await fs.mkdir(path.join(baseDir, dir), { recursive: true });
  }
}
