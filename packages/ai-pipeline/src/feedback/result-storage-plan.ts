import { ParsedAiResult } from '@gitcat/shared-types';

export type ParsedResultStorageTarget = 'merge_proposal' | 'recommendation_history';

export interface LocalArtifactRefEntry {
  field_name: 'merged_code_ref';
  artifact_kind: 'code';
  ref: string;
}

export interface MergeProposalSqliteMetadataDraft {
  proposal_id: string;
  ai_request_id: string;
  feature_type: 'merge_patch_draft' | 'conflict_explanation' | 'merge_mediation';
  title: string;
  explanation_summary: string | null;
  confidence_score: number | null;
  status: ParsedAiResult['proposal_status'];
  validation_required?: boolean;
  validation_summary?: string | null;
}

export interface RecommendationHistorySqliteMetadataDraft {
  ai_request_id: string;
  recommendation_type: string;
  result_summary: string;
  result_text: string;
  alternative_texts: string[];
  generation_basis_summary: string | null;
  format_notes: string | null;
  warnings: string[];
}

interface ParsedResultStoragePlanBase {
  proposal_id: string;
  session_id: string;
  ai_request_id: string;
  feature_type: ParsedAiResult['feature_type'];
  storage_target: ParsedResultStorageTarget;
  local_artifact_refs: LocalArtifactRefEntry[];
  pending_linkage_fields: string[];
  supplemental_metadata: Record<string, unknown>;
}

export interface MergeProposalStoragePlan extends ParsedResultStoragePlanBase {
  storage_target: 'merge_proposal';
  sqlite_metadata: MergeProposalSqliteMetadataDraft;
}

export interface RecommendationStoragePlan extends ParsedResultStoragePlanBase {
  storage_target: 'recommendation_history';
  sqlite_metadata: RecommendationHistorySqliteMetadataDraft;
}

export type ParsedResultStoragePlan =
  | MergeProposalStoragePlan
  | RecommendationStoragePlan;

function collectLocalArtifactRefs(result: ParsedAiResult): LocalArtifactRefEntry[] {
  if (result.feature_type !== 'merge_patch_draft') {
    return [];
  }
  return [{
    field_name: 'merged_code_ref',
    artifact_kind: 'code',
    ref: result.merged_code_ref,
  }];
}

function buildMergeProposalStoragePlan(
  result: Exclude<ParsedAiResult, { feature_type: 'recommendation' }>,
): MergeProposalStoragePlan {
  const sqliteMetadata: MergeProposalSqliteMetadataDraft = {
    proposal_id: result.proposal_id,
    ai_request_id: result.ai_request_id,
    feature_type: result.feature_type,
    title: result.title,
    explanation_summary: result.explanation ?? null,
    confidence_score: result.confidence_score ?? null,
    status: result.proposal_status,
  };

  if (result.feature_type === 'merge_patch_draft') {
    sqliteMetadata.validation_required = result.validation_required;
    sqliteMetadata.validation_summary = result.validation_summary;
  }

  return {
    proposal_id: result.proposal_id,
    session_id: result.session_id,
    ai_request_id: result.ai_request_id,
    feature_type: result.feature_type,
    storage_target: 'merge_proposal',
    sqlite_metadata: sqliteMetadata,
    local_artifact_refs: collectLocalArtifactRefs(result),
    // parsed_ai_result만으로는 저장소 FK/조회용 연결키를 아직 모두 채울 수 없습니다.
    // 이 목록을 남겨 두면 Task 20에서 어떤 입력이 추가로 필요한지 바로 드러납니다.
    pending_linkage_fields: ['conflict_candidate_id', 'inference_run_id', 'file_path'],
    supplemental_metadata:
      result.feature_type === 'merge_patch_draft'
        ? {
            summary: result.summary,
            parser_version: result.parser_version,
            applied_files: result.applied_files,
          }
        : result.feature_type === 'conflict_explanation'
          ? {
              summary: result.summary,
              parser_version: result.parser_version,
              cause_summary: result.cause_summary,
              detailed_explanation: result.detailed_explanation,
              related_files: result.related_files,
              recommended_resolution_direction:
                result.recommended_resolution_direction,
              risk_level: result.risk_level,
            }
          : {
              summary: result.summary,
              parser_version: result.parser_version,
              recommended_option: result.recommended_option,
              tradeoffs: result.tradeoffs,
              recommended_next_action: result.recommended_next_action,
            },
  };
}

function buildRecommendationStoragePlan(
  result: Extract<ParsedAiResult, { feature_type: 'recommendation' }>,
): RecommendationStoragePlan {
  return {
    proposal_id: result.proposal_id,
    session_id: result.session_id,
    ai_request_id: result.ai_request_id,
    feature_type: result.feature_type,
    storage_target: 'recommendation_history',
    sqlite_metadata: {
      ai_request_id: result.ai_request_id,
      recommendation_type: result.recommendation_type,
      result_summary: result.summary,
      result_text: result.primary_text,
      alternative_texts: result.alternative_texts,
      generation_basis_summary: result.generation_basis_summary ?? null,
      format_notes: result.format_notes ?? null,
      warnings: result.warnings ?? [],
    },
    local_artifact_refs: [],
    pending_linkage_fields: ['inference_run_id'],
    supplemental_metadata: {
      title: result.title,
      parser_version: result.parser_version,
      proposal_status: result.proposal_status,
      confidence_score: result.confidence_score ?? null,
    },
  };
}

/**
 * 공식 문서의 parsed_ai_result 계약을 기준으로
 * "SQLite 메타데이터"와 "로컬 파일 ref"를 분리한 save-ready plan을 만듭니다.
 *
 * 이 단계에서는 아직 repository insert를 수행하지 않습니다.
 * 대신 현재 결과만으로 확정 가능한 값과,
 * Core/Storage 계층에서 추가로 채워야 하는 연결키를 명시적으로 분리합니다.
 */
export function buildParsedResultStoragePlan(
  result: ParsedAiResult,
): ParsedResultStoragePlan {
  if (result.feature_type === 'recommendation') {
    return buildRecommendationStoragePlan(result);
  }

  return buildMergeProposalStoragePlan(result);
}
