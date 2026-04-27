import type { InboundPayload } from '../../../../packages/shared-types/src/dto/messages';

/**
 * 추천 관련 Inbound 메시지 핸들러 계약입니다.
 *
 * 각 메서드는 메시지 type에 대응되는 payload 타입을 정확히 강제합니다.
 */
export interface RecommendationMessageHandlers {
  recommendCommit(payload: InboundPayload<'RECOMMEND_COMMIT'>): Promise<void>;
  recommendBranch(payload: InboundPayload<'RECOMMEND_BRANCH'>): Promise<void>;
  recommendPr(payload: InboundPayload<'RECOMMEND_PR'>): Promise<void>;
}

/**
 * 병합 관련 Inbound 메시지 핸들러 계약입니다.
 */
export interface MergeMessageHandlers {
  analyzeConflict(payload: InboundPayload<'ANALYZE_CONFLICT'>): Promise<void>;
  acceptMerge(payload: InboundPayload<'ACCEPT_MERGE'>): Promise<void>;
  rejectMerge(payload: InboundPayload<'REJECT_MERGE'>): Promise<void>;
  runMerge(payload: InboundPayload<'RUN_MERGE'>): Promise<void>;
}

/**
 * 추천 핸들러 스텁 팩토리입니다.
 *
 * 현재(1단계)는 라우팅 시그니처만 확정하는 단계이므로
 * 실제 비즈니스 구현 대신 명시적인 예외를 던져 미구현 상태를 드러냅니다.
 */
export const createRecommendationMessageHandlers = (): RecommendationMessageHandlers => ({
  recommendCommit: async () => {
    throw new Error('Not implemented in phase 1');
  },
  recommendBranch: async () => {
    throw new Error('Not implemented in phase 1');
  },
  recommendPr: async () => {
    throw new Error('Not implemented in phase 1');
  },
});

/**
 * 병합 핸들러 스텁 팩토리입니다.
 */
export const createMergeMessageHandlers = (): MergeMessageHandlers => ({
  analyzeConflict: async () => {
    throw new Error('Not implemented in phase 1');
  },
  acceptMerge: async () => {
    throw new Error('Not implemented in phase 1');
  },
  rejectMerge: async () => {
    throw new Error('Not implemented in phase 1');
  },
  runMerge: async () => {
    throw new Error('Not implemented in phase 1');
  },
});
