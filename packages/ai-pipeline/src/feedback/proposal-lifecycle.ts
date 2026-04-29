import { MergeProposalStatus, SelectionStatus } from '@gitcat/shared-types';

export type ProposalLifecycleEvent =
  | 'display'
  | 'accept'
  | 'edit'
  | 'reject'
  | 'complete'
  | 'fail';

const proposalLifecycleMap: Record<
  MergeProposalStatus,
  Partial<Record<ProposalLifecycleEvent, MergeProposalStatus>>
> = {
  generated: {
    complete: 'completed',
    fail: 'failed',
  },
  parsed: {
    display: 'displayed',
    fail: 'failed',
  },
  displayed: {
    accept: 'accepted',
    edit: 'edited',
    reject: 'rejected',
    fail: 'failed',
  },
  accepted: {
    complete: 'completed',
  },
  edited: {
    complete: 'completed',
  },
  rejected: {
    complete: 'completed',
  },
  completed: {},
  failed: {},
  archived: {},
};

/**
 * proposal 상태 전이 규칙을 한 곳에서 관리합니다.
 * UI 표시, 사용자 선택, 저장 완료가 서로 다른 모듈에 흩어져도
 * 실제 다음 상태는 이 테이블 기준으로만 계산되게 하려는 목적입니다.
 */
export function transitionProposalStatus(
  currentStatus: MergeProposalStatus,
  event: ProposalLifecycleEvent,
): MergeProposalStatus {
  const nextStatus = proposalLifecycleMap[currentStatus][event];

  if (!nextStatus) {
    throw new Error(
      `Invalid proposal status transition: ${currentStatus} -> ${event}`,
    );
  }

  return nextStatus;
}

/**
 * 사용자 최종 선택은 proposal_status와 직접 대응됩니다.
 * feedback/save 계층에서는 selection_status를 먼저 알고 있으므로
 * 그 값을 proposal 상태 전이 이벤트로 바꾸는 helper를 둡니다.
 */
export function selectionStatusToLifecycleEvent(
  selectionStatus: SelectionStatus,
): ProposalLifecycleEvent {
  switch (selectionStatus) {
    case 'accepted':
      return 'accept';
    case 'edited':
      return 'edit';
    case 'rejected':
      return 'reject';
  }
}

/**
 * 사용자 피드백은 문서상 "표시된 결과"를 대상으로 발생합니다.
 * 하지만 mock/서비스 초안 단계에서는 parsed 상태 결과가 바로 들어올 수 있으므로,
 * selection 전이 전에 displayed 상태까지 한 번 보정할 수 있게 helper를 둡니다.
 */
export function normalizeProposalStatusForSelection(
  status: MergeProposalStatus,
): MergeProposalStatus {
  if (status === 'parsed') {
    return transitionProposalStatus(status, 'display');
  }

  return status;
}

/**
 * completed / failed / archived 이후에는 더 이상 사용자 선택을 받지 않는다는 가정을 둡니다.
 */
export function isTerminalProposalStatus(
  status: MergeProposalStatus,
): boolean {
  return status === 'completed' || status === 'failed' || status === 'archived';
}

/**
 * 현재 상태에서 허용되는 다음 이벤트를 UI/서비스가 참고할 수 있게 노출합니다.
 * 예를 들어 displayed 상태에서만 accept/edit/reject 버튼을 활성화하는 식으로 활용할 수 있습니다.
 */
export function getAllowedProposalLifecycleEvents(
  status: MergeProposalStatus,
): ProposalLifecycleEvent[] {
  return Object.keys(proposalLifecycleMap[status]) as ProposalLifecycleEvent[];
}
