import { useCallback, useEffect, useState } from 'react';
import { getVsCodeWebviewApi } from './useVsCodeApi';
import type { SidebarSectionKey } from './useSidebarSectionWeights';
import {
  DEFAULT_SIDEBAR_SECTION_EXPANDED,
  type SidebarSectionExpanded,
} from './sidebarSectionLayout';

const VSCODE_STATE_KEY = 'gitcatSidebarSectionExpanded';
const LOCAL_STORAGE_KEY = 'gitcat.sidebar.sectionExpanded.v1';

function isValidExpanded(value: unknown): value is Partial<SidebarSectionExpanded> {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return Object.entries(obj).every(([k, v]) => {
    const key = k as SidebarSectionKey;
    return (
      (key === 'git' ||
        key === 'filetree' ||
        key === 'safety' ||
        key === 'branch' ||
        key === 'stash') &&
      typeof v === 'boolean'
    );
  });
}

function readFromVsCodeState(): Partial<SidebarSectionExpanded> | undefined {
  const api = getVsCodeWebviewApi();
  if (!api) return undefined;
  const raw = api.getState() as Record<string, unknown> | undefined;
  const v = raw?.[VSCODE_STATE_KEY];
  return isValidExpanded(v) ? v : undefined;
}

function writeToVsCodeState(expanded: SidebarSectionExpanded): void {
  const api = getVsCodeWebviewApi();
  if (!api) return;
  const prev = { ...((api.getState() as Record<string, unknown>) ?? {}) };
  prev[VSCODE_STATE_KEY] = expanded;
  try {
    api.setState(prev);
  } catch {
    /* ignore */
  }
}

function readFromLocalStorage(): Partial<SidebarSectionExpanded> | undefined {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return isValidExpanded(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeToLocalStorage(expanded: SidebarSectionExpanded): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(expanded));
  } catch {
    /* ignore */
  }
}

function loadInitialExpanded(): SidebarSectionExpanded {
  const stored = readFromVsCodeState() ?? readFromLocalStorage();
  if (!stored) return DEFAULT_SIDEBAR_SECTION_EXPANDED;
  return { ...DEFAULT_SIDEBAR_SECTION_EXPANDED, ...stored };
}

export function useSidebarSectionExpanded() {
  const [expanded, setExpanded] = useState<SidebarSectionExpanded>(loadInitialExpanded);

  useEffect(() => {
    writeToVsCodeState(expanded);
    writeToLocalStorage(expanded);
  }, [expanded]);

  const toggleSection = useCallback((key: SidebarSectionKey) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return { expanded, setExpanded, toggleSection };
}
