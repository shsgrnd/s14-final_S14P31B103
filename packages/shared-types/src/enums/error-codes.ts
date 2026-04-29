import { z } from 'zod';

/**
 * GitCat 시스템 전반에서 사용하는 에러 코드 정의
 */
export const ErrorCodeEnum = z.enum([
  // 일반 에러
  'INTERNAL_ERROR',
  'INVALID_PARAMETER',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN',

  // Git 관련 에러
  'GIT_NOT_FOUND',
  'GIT_NOT_REPOSITORY',
  'GIT_OPERATION_FAILED',
  'GIT_BRANCH_NOT_FOUND',
  'GIT_BRANCH_ALREADY_EXISTS',
  'GIT_WORKING_TREE_DIRTY',
  'GIT_MERGE_CONFLICT',
  'GIT_PUSH_FAILED',
  'GIT_PULL_FAILED',
  'GIT_ADD_FAILED',
  'GIT_COMMIT_FAILED',
  'GIT_STASH_FAILED',
  'GIT_RESTORE_FAILED',

  // 스냅샷 관련 에러
  'SNAPSHOT_NOT_FOUND',
  'SNAPSHOT_CREATE_FAILED',
  'SNAPSHOT_RESTORE_FAILED',

  // DB 관련 에러
  'DB_QUERY_FAILED',
  'DB_CONNECTION_FAILED',

  // AI 관련 에러
  'AI_REQUEST_FAILED',
  'AI_PARSE_FAILED',
  'AI_QUOTA_EXCEEDED',
]);

export type ErrorCode = z.infer<typeof ErrorCodeEnum>;
