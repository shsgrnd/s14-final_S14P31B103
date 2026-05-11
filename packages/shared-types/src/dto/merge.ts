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
 * session context는 Extension/storage 흐름에서 보강할 수 있으므로
 * 로컬 MVP의 Webview 요청에서는 필수로 요구하지 않습니다.
 */
export const AnalyzeConflictRequestSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  sourceWorktreeInstanceId: z.string().min(1).optional(),
  targetWorktreeInstanceId: z.string().min(1).optional(),
  workspaceRoot: z.string().min(1).optional(),
}).strict();
export type AnalyzeConflictRequest = z.infer<typeof AnalyzeConflictRequestSchema>;

/** 병합안 수락 요청 payload DTO */
export const AcceptMergeRequestSchema = z.object({
  proposalId: z.string().min(1),
  candidateId: z.string().min(1).optional(),
  filePath: z.string().min(1),
  proposedContent: z.string(),
  finalExplanation: z.string().optional(),
}).strict();
export type AcceptMergeRequest = z.infer<typeof AcceptMergeRequestSchema>;

/** 병합안 거절 요청 payload DTO */
export const RejectMergeRequestSchema = z.object({
  proposalId: z.string().min(1),
  candidateId: z.string().min(1).optional(),
  filePath: z.string().min(1).optional(),
  feedbackNote: z.string().optional(),
}).strict();
export type RejectMergeRequest = z.infer<typeof RejectMergeRequestSchema>;

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
});
export type MergeConflictCandidateView = z.infer<typeof MergeConflictCandidateViewSchema>;

/** MERGE_PROPOSAL 응답에서 Webview가 소비하는 병합 제안 projection DTO */
export const MergeProposalViewSchema = z.object({
  proposalId: z.string(),
  candidateId: z.string(),
  analysisId: z.string().optional(),
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
