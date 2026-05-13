import { z } from 'zod';

export const SessionTypeEnum = z.enum([
  'ai',
  'manual',
]);
export type SessionType = z.infer<typeof SessionTypeEnum>;

export const SessionStatusEnum = z.enum([
  'active',
  'closing',
  'completed',
  'failed',
]);
export type SessionStatus = z.infer<typeof SessionStatusEnum>;

export const SnapshotTypeEnum = z.enum([
  'ai_pre_action',
  'auto_dirty_before_ai',
  'ai_result',
  'manual_checkpoint',
  'manual_edit_result',
  'pre_restore',
]);
export type SnapshotType = z.infer<typeof SnapshotTypeEnum>;

export const SnapshotStatusEnum = z.enum([
  'pending',
  'completed',
  'failed',
  'restored',
]);
export type SnapshotStatus = z.infer<typeof SnapshotStatusEnum>;

export const RestoreStatusEnum = z.enum([
  'success',
  'failed',
  'partial',
]);
export type RestoreStatus = z.infer<typeof RestoreStatusEnum>;

export const ChangedFileStatusEnum = z.enum([
  'added',
  'modified',
  'deleted',
  'renamed',
]);
export type ChangedFileStatus = z.infer<typeof ChangedFileStatusEnum>;
