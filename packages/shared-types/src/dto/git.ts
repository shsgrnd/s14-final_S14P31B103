import { z } from 'zod';

/**
 * 스냅샷 내 개별 파일 정보
 */
export const SnapshotFileSchema = z.object({
  path: z.string(),
  status: z.enum(['MODIFIED', 'ADDED', 'DELETED']),
  added: z.number().optional(),
  removed: z.number().optional(),
});
export type SnapshotFile = z.infer<typeof SnapshotFileSchema>;

/**
 * 스냅샷 데이터 인터페이스
 */
export const SnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  timestamp: z.number(),
  type: z.enum(['AI_TASK', 'BEFORE_MERGE', 'MANUAL', 'SAFETY_BACKUP']),
  isStarred: z.boolean(),
  changesCount: z.number(),
  description: z.string().optional(),
  reason: z.string().optional(),
  snapshotPath: z.string().optional(),
  files: z.array(SnapshotFileSchema).optional(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

/**
 * 충돌 분석 결과 인터페이스
 */
export const ConflictAnalysisSchema = z.object({
  filePath: z.string(),
  lineRange: z.tuple([z.number(), z.number()]),
  severity: z.enum(['high', 'medium', 'low']),
  reason: z.string(),
  suggestion: z.string().optional(),
});
export type ConflictAnalysis = z.infer<typeof ConflictAnalysisSchema>;

/**
 * AI 병합 초안 인터페이스
 */
export const AIDraftSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  originalContent: z.string(),
  proposedContent: z.string(),
  mediationOpinion: z.string(),
});
export type AIDraft = z.infer<typeof AIDraftSchema>;

/**
 * 브랜치 데이터 인터페이스
 */
export const BranchSchema = z.object({
  name: z.string(),
  status: z.enum(['merged', 'stale', 'active', 'protected']),
  lastActivity: z.string(),
});
export type Branch = z.infer<typeof BranchSchema>;
