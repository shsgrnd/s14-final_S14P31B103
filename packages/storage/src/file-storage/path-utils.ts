/**
 * 파일 경로를 평탄화합니다. (예: src/auth/user.ts -> src__auth__user.ts)
 */
export function flattenPath(filePath: string): string {
  // 윈도우(\)와 맥/리눅스(/) 구분자를 모두 __로 치환
  return filePath.replace(/[\\/]/g, '__');
}

/**
 * 평탄화된 파일 경로를 원래 경로로 복원합니다.
 */
export function unflattenPath(flattenedPath: string): string {
  // 플랫폼에 맞는 구분자로 복원 (여기서는 기본적으로 / 사용)
  return flattenedPath.replace(/__/g, '/');
}
