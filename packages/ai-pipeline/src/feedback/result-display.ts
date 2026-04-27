import {
  ParsedAiResult,
  ParsedAiResultBase,
} from '@gitcat/shared-types';
import { transitionProposalStatus } from './proposal-lifecycle';

export interface DisplayField {
  label: string;
  value: string;
}

export interface DisplaySection {
  title: string;
  fields: DisplayField[];
}

export interface DisplayReadyResult {
  proposal_id: string;
  session_id: string;
  feature_type: ParsedAiResult['feature_type'];
  proposal_status: 'displayed';
  title: string;
  summary: string;
  explanation?: string;
  confidence_score?: number;
  sections: DisplaySection[];
}

/**
 * parsed_ai_result를 화면에 노출한 뒤 상태를 displayed로 바꿉니다.
 * 실제 저장 업데이트는 Core/저장 계층이 맡더라도, 표시 직후 상태값은 이 helper 기준으로 맞출 수 있습니다.
 */
export function markParsedResultDisplayed<T extends ParsedAiResult>(result: T): T {
  return {
    ...result,
    proposal_status: transitionProposalStatus(result.proposal_status, 'display'),
  };
}

/**
 * 공통 헤더 필드는 feature_type과 무관하게 같은 위치에 보이도록 분리합니다.
 * 이렇게 해 두면 UI 담당은 공통 레이아웃과 feature 전용 섹션만 나눠서 붙이면 됩니다.
 */
function buildBaseSections(result: ParsedAiResultBase): DisplaySection[] {
  return [
    {
      title: 'Overview',
      fields: [
        { label: 'Proposal ID', value: result.proposal_id },
        { label: 'Session ID', value: result.session_id },
        { label: 'Feature Type', value: result.feature_type },
        { label: 'Status', value: result.proposal_status },
        { label: 'Parser Version', value: result.parser_version },
      ],
    },
  ];
}

function joinList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'Not provided';
}

/**
 * feature마다 "사용자가 지금 보고 판단해야 하는 정보"가 다르기 때문에
 * 표시용 섹션도 결과 유형별로 분기합니다.
 */
function buildFeatureSections(result: ParsedAiResult): DisplaySection[] {
  switch (result.feature_type) {
    case 'merge_patch_draft':
      return [
        {
          title: 'Merge Draft',
          fields: [
            { label: 'Applied Files', value: joinList(result.applied_files) },
            { label: 'Diff Patch Ref', value: result.diff_patch_ref ?? 'Not provided' },
            { label: 'Merged Code Ref', value: result.merged_code_ref ?? 'Not provided' },
            { label: 'Validation Required', value: String(result.validation_required) },
            { label: 'Validation Summary', value: result.validation_summary },
          ],
        },
      ];
    case 'conflict_explanation':
      return [
        {
          title: 'Conflict Explanation',
          fields: [
            { label: 'Cause Summary', value: result.cause_summary },
            { label: 'Detailed Explanation', value: result.detailed_explanation },
            { label: 'Related Files', value: joinList(result.related_files) },
            {
              label: 'Recommended Resolution',
              value: result.recommended_resolution_direction,
            },
            { label: 'Risk Level', value: result.risk_level },
          ],
        },
      ];
    case 'merge_mediation':
      return [
        {
          title: 'Mediation Option',
          fields: [
            { label: 'Recommended Option', value: result.recommended_option },
            { label: 'Tradeoffs', value: joinList(result.tradeoffs) },
            { label: 'Recommended Next Action', value: result.recommended_next_action },
          ],
        },
      ];
    case 'recommendation':
      return [
        {
          title: 'Recommendation',
          fields: [
            { label: 'Recommendation Type', value: result.recommendation_type },
            { label: 'Primary Text', value: result.primary_text },
            { label: 'Alternative Texts', value: joinList(result.alternative_texts) },
            {
              label: 'Generation Basis',
              value: result.generation_basis_summary ?? 'Not provided',
            },
            {
              label: 'Format Notes',
              value: result.format_notes ?? 'Not provided',
            },
            {
              label: 'Warnings',
              value: joinList(result.warnings ?? []),
            },
          ],
        },
      ];
  }
}

/**
 * UI/Core가 parsed_ai_result를 그대로 들고 표시 로직을 짜기 시작하면
 * feature_type별 분기가 여러 군데 흩어지기 쉽습니다.
 * 이 helper는 그 분기를 한곳에 모아 "표시 직전 데이터"를 만든다는 목적입니다.
 */
export function buildDisplayReadyResult(result: ParsedAiResult): DisplayReadyResult {
  const displayedResult = markParsedResultDisplayed(result);

  return {
    proposal_id: displayedResult.proposal_id,
    session_id: displayedResult.session_id,
    feature_type: displayedResult.feature_type,
    proposal_status: 'displayed',
    title: displayedResult.title,
    summary: displayedResult.summary,
    explanation: displayedResult.explanation,
    confidence_score: displayedResult.confidence_score,
    sections: [
      ...buildBaseSections(displayedResult),
      ...buildFeatureSections(displayedResult),
    ],
  };
}
