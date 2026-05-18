import { z } from 'zod';
import {
  DetectionMethodEnum,
  FeatureTypeEnum,
  MergeProposalStatusEnum,
  RiskLevelEnum,
} from '../enums/ai';

/**
 * 충돌 분석 요청용 Webview 메시지 DTO입니다.
 *
 * 실제 AI 입력은 MergeProposalInputSchema 기준으로 조립합니다.
 * 이 DTO는 화면에서 Extension에 분석을 요청하는 계약만 담당합니다.
 * project, workspace, worktree instance 식별자는 Extension/storage 흐름에서 확정하므로
 * Webview 요청 계약에 포함하지 않습니다.
 */
export const AnalyzeConflictRequestSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  sessionId: z.string().min(1).optional(),
}).strict();
export type AnalyzeConflictRequest = z.infer<typeof AnalyzeConflictRequestSchema>;

/** 병합안 수락 요청 payload DTO */
export const AcceptMergeRequestSchema = z.object({
  proposalId: z.string().min(1),
  candidateId: z.string().min(1),
  analysisId: z.string().min(1),
  filePath: z.string().min(1),
  proposedContent: z.string(),
  finalExplanation: z.string().optional(),
}).strict();
export type AcceptMergeRequest = z.infer<typeof AcceptMergeRequestSchema>;

/** 병합안 거절 요청 payload DTO */
export const RejectMergeRequestSchema = z.object({
  proposalId: z.string().min(1),
  candidateId: z.string().min(1),
  analysisId: z.string().min(1),
  filePath: z.string().min(1).optional(),
  feedbackNote: z.string().optional(),
}).strict();
export type RejectMergeRequest = z.infer<typeof RejectMergeRequestSchema>;

/** AI 병합 제안 생성/조회 요청 payload DTO */
export const GetAiDraftRequestSchema = z.object({
  analysisId: z.string().min(1),
  candidateId: z.string().min(1),
  filePath: z.string().min(1),
  featureType: FeatureTypeEnum.extract([
    'merge_patch_draft',
    'merge_mediation',
    'conflict_explanation',
  ]).optional(),
  /** 분석할 충돌 구간 인덱스 목록 (0-based). 미제공 시 전체 분석 */
  selectedHunks: z.array(z.number().int().nonnegative()).optional(),
}).strict();
export type GetAiDraftRequest = z.infer<typeof GetAiDraftRequestSchema>;

export const ConflictKindEnum = z.enum([
  'hunk_overlap',
  'same_file',
  'full_file',
  'add_add',
]);
export type ConflictKind = z.infer<typeof ConflictKindEnum>;

/** 파일 내 검토 구간 (다중 hunk / full-file UI용) */
export const MergeConflictRegionSchema = z.object({
  id: z.string(),
  label: z.string(),
  lineStart: z.number().int(),
  lineEnd: z.number().int(),
  sourceExcerpt: z.string().optional(),
  targetExcerpt: z.string().optional(),
});
export type MergeConflictRegion = z.infer<typeof MergeConflictRegionSchema>;

/** CONFLICT_RESULT 응답에서 Webview가 소비하는 충돌 후보 projection DTO */
export const MergeConflictCandidateViewSchema = z.object({
  analysisId: z.string(),
  candidateId: z.string(),
  filePath: z.string(),
  lineStart: z.number().int(),
  lineEnd: z.number().int(),
  severity: z.enum(['high', 'medium', 'low']),
  reason: z.string(),
  suggestion: z.string().optional(),
  sourceExcerpt: z.string().optional(),
  targetExcerpt: z.string().optional(),
  baseExcerpt: z.string().optional(),
  detectedBy: DetectionMethodEnum,
  riskLevel: RiskLevelEnum.optional(),
  conflictKind: ConflictKindEnum.optional(),
  conflictRegions: z.array(MergeConflictRegionSchema).optional(),
  sourceFullContent: z.string().optional(),
  targetFullContent: z.string().optional(),
  baseFullContent: z.string().optional(),
  /** true면 상세 비교 본문은 GET_MERGE_COMPARE_CONTENT로 요청 */
  compareContentTruncated: z.boolean().optional(),
});
export type MergeConflictCandidateView = z.infer<typeof MergeConflictCandidateViewSchema>;

export const GetMergeCompareContentRequestSchema = z.object({
  analysisId: z.string().min(1),
  candidateId: z.string().min(1),
});
export type GetMergeCompareContentRequest = z.infer<typeof GetMergeCompareContentRequestSchema>;

export const MergeCompareContentPayloadSchema = z.object({
  analysisId: z.string(),
  candidateId: z.string(),
  sourceExcerpt: z.string().optional(),
  targetExcerpt: z.string().optional(),
  baseExcerpt: z.string().optional(),
  sourceFullContent: z.string().optional(),
  targetFullContent: z.string().optional(),
  baseFullContent: z.string().optional(),
  conflictRegions: z.array(MergeConflictRegionSchema).optional(),
});
export type MergeCompareContentPayload = z.infer<typeof MergeCompareContentPayloadSchema>;

/** MERGE_PROPOSAL 응답에서 Webview가 소비하는 병합 제안 projection DTO */
export const MergeProposalViewSchema = z.object({
  proposalId: z.string(),
  candidateId: z.string(),
  analysisId: z.string(),
  filePath: z.string(),
  featureType: FeatureTypeEnum.extract([
    'merge_patch_draft',
    'merge_mediation',
    'conflict_explanation',
  ]),
  title: z.string(),
  summary: z.string(),
  sourceContent: z.string().optional(),
  targetContent: z.string().optional(),
  proposedContent: z.string(),
  explanation: z.string(),
  confidenceScore: z.number().min(0).max(1).optional(),
  validationRequired: z.boolean().optional(),
  validationSummary: z.string().optional(),
  status: MergeProposalStatusEnum,
  appliedFiles: z.array(z.string()).optional(),
});
export type MergeProposalView = z.infer<typeof MergeProposalViewSchema>;

/** MERGE_COMPLETE 응답에서 Webview가 소비하는 병합 완료 상태 projection DTO */
export const MergeCompleteViewSchema = z.object({
  status: z.enum(['completed', 'conflicted', 'aborted', 'continued']),
  message: z.string().optional(),
  source: z.string().optional(),
  target: z.string().optional(),
  conflictedFiles: z.array(z.string()).optional(),
  completedAt: z.string(),
});
export type MergeCompleteView = z.infer<typeof MergeCompleteViewSchema>;
