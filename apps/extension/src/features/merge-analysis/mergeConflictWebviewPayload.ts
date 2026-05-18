import type {
  MergeCompareContentPayload,
  MergeConflictCandidateView,
  MergeConflictRegion,
} from '@gitcat/shared-types';

/** Webview postMessage에 실을 excerpt 상한 (초기 CONFLICT_RESULT·replay) */
export const WEBVIEW_EXCERPT_CHAR_CAP = 6_000;

function truncateExcerpt(value: string | undefined, cap: number): { text?: string; truncated: boolean } {
  if (value == null || value === '') {
    return { text: value, truncated: false };
  }
  if (value.length <= cap) {
    return { text: value, truncated: false };
  }
  return {
    text: `${value.slice(0, cap)}\n\n… (webview preview truncated)`,
    truncated: true,
  };
}

function sanitizeRegions(
  regions: MergeConflictRegion[] | undefined,
  cap: number,
): { regions?: MergeConflictRegion[]; truncated: boolean } {
  if (!regions?.length) {
    return { regions, truncated: false };
  }
  let truncated = false;
  const next = regions.map((region) => {
    const source = truncateExcerpt(region.sourceExcerpt, cap);
    const target = truncateExcerpt(region.targetExcerpt, cap);
    if (source.truncated || target.truncated) {
      truncated = true;
    }
    return {
      ...region,
      sourceExcerpt: source.text,
      targetExcerpt: target.text,
    };
  });
  return { regions: next, truncated };
}

/**
 * CONFLICT_RESULT 브로드캐스트용 후보 목록을 경량화합니다.
 * full-file 본문·과대 excerpt로 webview가 멈추거나 빈 화면이 되는 것을 방지합니다.
 */
export function sanitizeCandidatesForWebview(
  candidates: unknown[],
  cap: number = WEBVIEW_EXCERPT_CHAR_CAP,
): MergeConflictCandidateView[] {
  return (candidates as MergeConflictCandidateView[]).map((candidate) => {
    const hadFullFields = Boolean(
      candidate.sourceFullContent || candidate.targetFullContent || candidate.baseFullContent,
    );
    const source = truncateExcerpt(candidate.sourceExcerpt, cap);
    const target = truncateExcerpt(candidate.targetExcerpt, cap);
    const base = truncateExcerpt(candidate.baseExcerpt, cap);
    const regions = sanitizeRegions(candidate.conflictRegions, cap);
    const truncated =
      hadFullFields || source.truncated || target.truncated || base.truncated || regions.truncated;

    const {
      sourceFullContent: _s,
      targetFullContent: _t,
      baseFullContent: _b,
      compareContentTruncated: _prev,
      ...rest
    } = candidate;

    return {
      ...rest,
      sourceExcerpt: source.text,
      targetExcerpt: target.text,
      baseExcerpt: base.text,
      conflictRegions: regions.regions,
      compareContentTruncated: truncated || undefined,
    };
  });
}

/** MERGE_COMPARE_CONTENT 단건 응답 — postMessage 상한을 넘지 않도록 excerpt만 유지 */
export function sanitizeCompareContentPayload(
  payload: MergeCompareContentPayload,
  cap: number = WEBVIEW_EXCERPT_CHAR_CAP,
): MergeCompareContentPayload {
  const source = truncateExcerpt(payload.sourceExcerpt, cap);
  const target = truncateExcerpt(payload.targetExcerpt, cap);
  const base = truncateExcerpt(payload.baseExcerpt, cap);
  const regions = sanitizeRegions(payload.conflictRegions, cap);
  return {
    analysisId: payload.analysisId,
    candidateId: payload.candidateId,
    sourceExcerpt: source.text,
    targetExcerpt: target.text,
    baseExcerpt: base.text,
    conflictRegions: regions.regions,
  };
}
