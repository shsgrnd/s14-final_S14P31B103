import * as path from 'path';
import { GitClient } from '../ports/GitClient';

// ============================================================
// 수집 규칙 상수
// ============================================================

/**
 */
const MAX_RELATED_FILES = 50;
const EXCLUDED_EXTENSIONS = new Set([
  // 이미지
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff',
  // 폰트
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  // 바이너리/아카이브
  '.zip', '.tar', '.gz', '.rar', '.7z', '.exe', '.dll', '.so', '.dylib',
  // 미디어
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
  // 자동 생성 lock 파일 (확장자가 아닌 파일명으로 처리)
  // → EXCLUDED_FILE_NAMES에서 처리합니다.
  // PDF/문서
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
]);

/**
 * 확장자가 아닌 파일명 전체로 제외할 파일 목록.
 *
 * 왜 파일명으로 제외하는가?
 * - package-lock.json, yarn.lock 등은 확장자가 .json/.lock이지만 자동 생성 파일입니다.
 * - AI가 이 파일들의 변경 내용을 분석하는 것은 의미가 없습니다.
 */
const EXCLUDED_FILE_NAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Gemfile.lock',
  'Cargo.lock',
  'poetry.lock',
  'go.sum',
  'composer.lock',
  // VS Code 설정 중 자동 생성 파일
  '.DS_Store',
  'Thumbs.db',
]);

/**
 * 이 경로 패턴에 속하는 파일은 제외합니다.
 * (자동 생성 디렉토리, 빌드 결과물, 의존성 폴더 등)
 */
const EXCLUDED_PATH_PATTERNS = [
  /node_modules\//,
  /\.git\//,
  /dist\//,
  /build\//,
  /\.next\//,
  /\.nuxt\//,
  /coverage\//,
  /\.vscode\/gitcat\//,   // GitCat이 생성한 파일 자체는 제외
  /\.cache\//,
  /out\//,
];

// ============================================================
// 타입 정의
// ============================================================

export interface RelatedFilesResult {
  /** AI payload에 들어가는 최종 파일 경로 배열 */
  files: string[];
  /** 필터링 후 제한 적용 전 전체 후보 수 */
  total: number;
  /** MAX_RELATED_FILES를 초과해 일부가 잘렸으면 true */
  capped: boolean;
}

// ============================================================
// RelatedFilesCollector 클래스
// ============================================================

export class RelatedFilesCollector {
  constructor(private readonly gitClient: GitClient) { }

  /**
   * related_files 목록을 수집합니다.
   *
   * @param conflictFilePaths 충돌 후보 파일 경로 배열 (ConflictCandidate[]에서 추출)
   * @param repoPath          Git 저장소 경로 (선택적)
   * @returns RelatedFilesResult (files, total, capped)
   */
  async collect(
    conflictFilePaths: string[],
    repoPath?: string
  ): Promise<RelatedFilesResult> {
    // ── Step 1: conflict_candidates 파일 경로 (중복 제거) ────────────────────────
    // 충돌 후보가 존재하는 파일은 반드시 related_files에 포함되어야 합니다.
    // 이 파일들은 최종 목록에서 앞쪽에 배치됩니다.
    const conflictFileSet = new Set(conflictFilePaths);

    // ── Step 2: git에서 변경된 파일 목록 수집 ────────────────────────────────────
    // `git diff HEAD --name-only`로 staged + unstaged 모두 포함한 변경 파일을 가져옵니다.
    let changedFromGit: string[] = [];
    try {
      changedFromGit = await this.gitClient.getChangedFileNames(repoPath);
    } catch (error) {
      // git 조회 실패 시 conflict 파일만으로 진행합니다.
      console.warn('[RelatedFilesCollector] git 변경 파일 조회 실패, conflict 파일만 사용합니다:', error);
    }

    // ── Step 3: 두 목록을 합쳐 전체 후보 목록 구성 ──────────────────────────────
    // conflict 파일을 앞에 두고, git 변경 파일을 뒤에 추가합니다.
    // Set을 사용해 중복을 자동으로 제거합니다.
    const allCandidates = new Set([
      ...conflictFileSet,      // 충돌 후보 파일 (우선순위 1)
      ...changedFromGit,       // git 변경 파일 (우선순위 2)
    ]);

    // ── Step 4: 필터링 적용 ───────────────────────────────────────────────────────
    // 바이너리, lock 파일, 빌드 폴더 등을 제거합니다.
    const filtered = Array.from(allCandidates).filter(filePath =>
      this.isIncluded(filePath)
    );

    const total = filtered.length;

    // ── Step 5: 정렬 ─────────────────────────────────────────────────────────────
    // conflict 파일을 앞에 배치하고, 나머지는 알파벳 순으로 정렬합니다.
    // 정렬이 고정되면 같은 변경사항에서 항상 같은 결과가 나와 재현 가능합니다.
    const conflictFiles = filtered.filter(f => conflictFileSet.has(f));
    const otherFiles = filtered
      .filter(f => !conflictFileSet.has(f))
      .sort();   // 알파벳 순 정렬

    const sorted = [...conflictFiles, ...otherFiles];

    // ── Step 6: 개수 제한 ─────────────────────────────────────────────────────────
    // MAX_RELATED_FILES를 초과하면 앞에서부터 잘라냅니다.
    // conflict 파일이 앞에 있으므로 우선순위가 보장됩니다.
    const capped = sorted.length > MAX_RELATED_FILES;
    const files = capped ? sorted.slice(0, MAX_RELATED_FILES) : sorted;

    if (capped) {
      console.warn(
        `[RelatedFilesCollector] related_files 후보가 ${total}개로 MAX(${MAX_RELATED_FILES})를 초과합니다. ` +
        `${MAX_RELATED_FILES}개로 제한합니다.`
      );
    } else {
      console.log(`[RelatedFilesCollector] related_files 수집 완료: ${files.length}개`);
    }

    return { files, total, capped };
  }

  // ============================================================
  // ▼ 필터링 규칙 메서드들
  // ============================================================

  /**
   */
  private isIncluded(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');

    // 규칙 1: 자동 생성 디렉토리 포함 여부 확인
    // node_modules/, dist/, .git/ 등에 속하는 파일은 제외합니다.
    if (EXCLUDED_PATH_PATTERNS.some(pattern => pattern.test(normalizedPath))) {
      return false;
    }

    // 규칙 2: 파일명으로 제외 (lock 파일 등)
    const fileName = path.basename(normalizedPath);
    if (EXCLUDED_FILE_NAMES.has(fileName)) {
      return false;
    }

    // 규칙 3: 확장자로 제외 (바이너리, 미디어 등)
    const ext = path.extname(normalizedPath).toLowerCase();
    if (ext && EXCLUDED_EXTENSIONS.has(ext)) {
      return false;
    }

    return true;
  }
}
