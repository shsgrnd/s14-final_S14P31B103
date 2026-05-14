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
  createdAt: z.string(),
  summary: z.string().optional(),
  reason: z.string().optional(),
  sessionId: z.string().optional(),
  previousSnapshotId: z.string().optional(),
  changedFileCount: z.number().int().optional(),
  warningCount: z.number().int().optional(),
  warningSummary: z.array(z.string()).optional(),
  localPath: z.string().optional(),
  files: z.array(z.object({
    path: z.string(),
    status: ChangedFileStatusEnum,
    added: z.number().int().optional(),
    removed: z.number().int().optional(),
    additions: z.number().int().optional(),
    deletions: z.number().int().optional(),
    hunkCount: z.number().int().optional(),
    isBinary: z.boolean().optional(),
    isLargeFile: z.boolean().optional(),
    importance: z.enum(['low', 'medium', 'high']).optional(),
    renamedFrom: z.string().optional(),
    renamedTo: z.string().optional(),
  })).optional(),
});

export const SafetyWarningSchema = z.object({
  warningId: z.string(),
  type: z.enum(['large_deletion', 'sensitive_file_change', 'untracked_conflict']),
  message: z.string(),
  filePaths: z.array(z.string()).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
});

export const SnapshotHunkSchema = z.object({
  hunkId: z.string(),
  filePath: z.string().optional(),
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
  beforeHash: z.string().optional(),
  afterHash: z.string().optional(),
  hunkCount: z.number().int().optional(),
  renamedFrom: z.string().optional(),
  renamedTo: z.string().optional(),
  isBinary: z.boolean().optional(),
  isLargeFile: z.boolean().optional(),
  isCommentOnly: z.boolean().optional(),
  importance: z.enum(['low', 'medium', 'high']).optional(),
  excludedReason: z.enum(['binary', 'large_file', 'whitespace_only']).optional(),
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
  warnings: z.array(SafetyWarningSchema).optional(),
});

export const SnapshotDetailSchema = z.object({
  meta: SnapshotMetaSchema,
  manifest: SnapshotManifestSchema,
  diffText: z.string().optional(),
  files: z.array(SnapshotFileSchema).optional(),
  hunks: z.array(SnapshotHunkSchema).optional(),
  warningSummary: z.array(z.string()).optional(),
});

// ==========================================
// 3. Restore Schemas
// ==========================================

export const RestoreHistorySchema = z.object({
  restoreId: z.string(),
  fromSnapshotId: z.string(),
  toSnapshotId: z.string(),
  preRestoreSnapshotId: z.string().optional(),
  status: RestoreStatusEnum,
  restoredAt: z.string(),
  failureReason: z.string().optional(),
});
