import type { PRSuggestion } from '@gitcat/shared-types';
import type { LogEntryResponse } from '../git/GitService';

/**
 * PR 추천 서비스 내부에서 Git raw data를 묶어 전달하기 위한 DTO입니다.
 * Webview/Extension 메시지 계약이 아니라 Extension 내부 service input.
 */
export interface PrRecommendationRawDataDto {
  baseBranch: string;
  currentBranch: string;
  diffText: string;
  changedFiles: string[];
  commits: LogEntryResponse[];
  template?: string;
}

/**
 * Webview로 반환되는 PR 추천 결과와 같은 shape입니다.
 * 실제 outbound 검증 계약은 shared-types의 PRSuggestionSchema 사용.
 */
export type PrRecommendationResultDto = PRSuggestion;
