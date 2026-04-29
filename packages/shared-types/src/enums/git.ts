import { z } from 'zod';

/**
 * 브랜치의 상태를 정의합니다.
 */
export const BranchStatusEnum = z.enum(['active', 'merged', 'stale', 'protected']);
export type BranchStatus = z.infer<typeof BranchStatusEnum>;

/**
 * Git 파일의 변경 상태를 정의합니다.
 */
export const GitFileStatusTypeEnum = z.enum([
  'ADDED',
  'MODIFIED',
  'DELETED',
  'RENAMED',
  'CONFLICTED',
  'UNTRACKED'
]);
export type GitFileStatusType = z.infer<typeof GitFileStatusTypeEnum>;
