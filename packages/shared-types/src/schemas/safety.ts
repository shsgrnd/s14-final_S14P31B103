import { z } from 'zod';
import {
  SnapshotTypeEnum,
  SnapshotStatusEnum,
  RestoreStatusEnum,
  ChangedFileStatusEnum,
  SessionTypeEnum,
  SessionStatusEnum,
} from '../enums/safety';

// ==========================================
// 1. Session Schemas
// ==========================================

export const SessionMetaSchema = z.object({
  sessionId: z.string(),
  type: SessionTypeEnum,
  status: SessionStatusEnum,
  startedAt: z.string(),
  endedAt: z.string().optional(),
  baseSnapshotId: z.string().optional(),
});

// ==========================================
// 2. Snapshot Schemas
// ==========================================

export const SnapshotMetaSchema = z.object({
  snapshotId: z.string(),
  type: SnapshotTypeEnum,
  status: SnapshotStatusEnum.optional(),
  isCheckpoint: z.boolean(),
  createdAt: z.string(),
  summary: z.string().optional(),
  reason: z.string().optional(),
});

export const SnapshotHunkSchema = z.object({
  hunkId: z.string(),
  oldStart: z.number().int(),
  oldLines: z.number().int(),
  newStart: z.number().int(),
  newLines: z.number().int(),
  beforeText: z.string(),
  afterText: z.string(),
});

export const SnapshotFileSchema = z.object({
  filePath: z.string(),
  status: ChangedFileStatusEnum,
  additions: z.number().int().optional(),
  deletions: z.number().int().optional(),
  hunks: z.array(SnapshotHunkSchema).optional(),
});

export const SnapshotManifestSchema = z.object({
  snapshotId: z.string(),
  type: SnapshotTypeEnum,
  previousSnapshotId: z.string().optional(),
  createdAt: z.string(),
  summary: z.string().optional(),
  reason: z.string().optional(),
  changedFiles: z.array(SnapshotFileSchema),
  warnings: z.array(z.any()).optional(), // or SafetyWarningSchema
});

export const SnapshotDetailSchema = z.object({
  meta: SnapshotMetaSchema,
  manifest: SnapshotManifestSchema,
  diffText: z.string().optional(),
});

// ==========================================
// 3. Restore Schemas
// ==========================================

export const RestoreHistorySchema = z.object({
  restoreId: z.string(),
  targetSnapshotId: z.string(),
  preRestoreSnapshotId: z.string().optional(),
  status: RestoreStatusEnum,
  restoredAt: z.string(),
});

// ==========================================
// 4. Safety Warnings
// ==========================================

export const SafetyWarningSchema = z.object({
  warningId: z.string(),
  type: z.enum(['large_deletion', 'sensitive_file_change', 'untracked_conflict']),
  message: z.string(),
  filePaths: z.array(z.string()).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
});
