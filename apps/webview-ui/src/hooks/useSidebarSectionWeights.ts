import { useCallback, useEffect, useState } from 'react';
import { getVsCodeWebviewApi } from './useVsCodeApi';

/**
 * 사이드바 섹션 키. SidebarLayout 의 expanded state 와 정확히 1:1 매칭된다.
 */
export type SidebarSectionKey = 'git' | 'filetree' | 'safety' | 'branch' | 'stash';

/**
 * 각 섹션의 flex-grow 가중치.
 * - 기본값은 Files 2, 나머지 1 (Files 영역이 다른 섹션이 펼쳐졌을 때도 우선적으로 공간 확보)
 * - 사용자가 리사이즈 핸들을 드래그하면 인접한 두 섹션의 가중치가 재분배된다.
 * - 합산값은 유지되지 않을 수 있으며(개별 페어 합 보존), 실제 비율은 펼친 섹션의 가중치 합 기준으로 계산된다.
 */
export type SidebarSectionWeights = Record<SidebarSectionKey, number>;

export const DEFAULT_SIDEBAR_SECTION_WEIGHTS: SidebarSectionWeights = {
  git: 1,
  filetree: 2,
  safety: 1,
  branch: 1,
  stash: 1,
};

/**
 * VS Code webview state 키. 버전 suffix(v1)는 추후 마이그레이션 안전성 확보용.
 *
 * 저장 전략(이 PR 기준):
 * - 1차: VS Code Webview `getState/setState` — 패널 단위로 직렬화되어 웹뷰 재로드 시 유지된다.
 * - 2차(fallback): `localStorage` — 개발 모드(브라우저)나 VS Code API 미연결 환경에서 사용.
 * - 워크스페이스/머신 단위 동기화가 필요하면 추후 `vscode.ExtensionContext.workspaceState` 메시지로 승격.
 */
const VSCODE_STATE_KEY = 'gitcatSidebarSectionWeights';
const LOCAL_STORAGE_KEY = 'gitcat.sidebar.sectionWeights.v1';

function isValidWeights(value: unknown): value is Partial<SidebarSectionWeights> {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return Object.entries(obj).every(([_, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0);
}

function readFromVsCodeState(): Partial<SidebarSectionWeights> | undefined {
  const api = getVsCodeWebviewApi();
  if (!api) return undefined;
  const raw = api.getState() as Record<string, unknown> | undefined;
  const v = raw?.[VSCODE_STATE_KEY];
  return isValidWeights(v) ? v : undefined;
}

function writeToVsCodeState(weights: SidebarSectionWeights): void {
  const api = getVsCodeWebviewApi();
  if (!api) return;
  const prev = { ...((api.getState() as Record<string, unknown>) ?? {}) };
  prev[VSCODE_STATE_KEY] = weights;
  try {
    api.setState(prev);
  } catch {
    /* ignore */
  }
}

function readFromLocalStorage(): Partial<SidebarSectionWeights> | undefined {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return isValidWeights(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeToLocalStorage(weights: SidebarSectionWeights): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(weights));
  } catch {
    /* ignore */
  }
}

function loadInitialWeights(): SidebarSectionWeights {
  const stored = readFromVsCodeState() ?? readFromLocalStorage();
  if (!stored) return DEFAULT_SIDEBAR_SECTION_WEIGHTS;
  return { ...DEFAULT_SIDEBAR_SECTION_WEIGHTS, ...stored };
}

export interface UseSidebarSectionWeightsResult {
  weights: SidebarSectionWeights;
  /** 인접한 두 섹션 사이의 핸들을 드래그할 때 호출. 두 섹션의 가중치 합은 유지된다. */
  setPairWeights: (above: SidebarSectionKey, below: SidebarSectionKey, newAbove: number, newBelow: number) => void;
  /** 기본값으로 되돌린다(접근성/디버깅용). */
  resetWeights: () => void;
}

/**
 * 사이드바 섹션의 세로 리사이즈 가중치를 관리하는 hook.
 * 가중치 변경 시 VS Code state + localStorage 양쪽에 비동기적으로 저장한다.
 */
export function useSidebarSectionWeights(): UseSidebarSectionWeightsResult {
  const [weights, setWeights] = useState<SidebarSectionWeights>(loadInitialWeights);

  useEffect(() => {
    writeToVsCodeState(weights);
    writeToLocalStorage(weights);
  }, [weights]);

  const setPairWeights = useCallback(
    (above: SidebarSectionKey, below: SidebarSectionKey, newAbove: number, newBelow: number) => {
      if (above === below) return;
      // 0 이하의 가중치는 의미가 없으므로 최소값으로 클램프
      const MIN_WEIGHT = 0.1;
      const clampedAbove = Math.max(MIN_WEIGHT, newAbove);
      const clampedBelow = Math.max(MIN_WEIGHT, newBelow);
      setWeights((prev) => ({ ...prev, [above]: clampedAbove, [below]: clampedBelow }));
    },
    [],
  );

  const resetWeights = useCallback(() => {
    setWeights(DEFAULT_SIDEBAR_SECTION_WEIGHTS);
  }, []);

  return { weights, setPairWeights, resetWeights };
}
