import { create } from 'zustand';
import { Snapshot, ConflictAnalysis, AIDraft, GitCatMessage, Branch } from '../types/GitCatMessage';

interface GitCatState {
  // Data
  snapshots: Snapshot[];
  conflicts: ConflictAnalysis[];
  currentAIDraft: AIDraft | null;
  currentBranch: string;
  isAnalyzing: boolean;
  
  // Phase 2 New Data
  branches: Branch[];
  aiCommitSuggestion: string;
  expandedSections: string[];
  expandedSnapshotId: string | null;

  // Actions
  setSnapshots: (snapshots: Snapshot[]) => void;
  setConflicts: (conflicts: ConflictAnalysis[]) => void;
  setAIDraft: (draft: AIDraft | null) => void;
  setCurrentBranch: (branch: string) => void;
  setAnalyzing: (isAnalyzing: boolean) => void;
  setBranches: (branches: Branch[]) => void;
  setAICommitSuggestion: (suggestion: string) => void;
  toggleSection: (sectionId: string) => void;
  setExpandedSnapshotId: (id: string | null) => void;
  
  handleMessage: (event: MessageEvent<GitCatMessage>) => void;
  

}



export const useGitCatStore = create<GitCatState>((set, get) => ({
  snapshots: [],
  conflicts: [],
  currentAIDraft: null,
  currentBranch: 'main',
  isAnalyzing: false,
  branches: [],
  aiCommitSuggestion: '',
  expandedSections: ['git', 'safety', 'branch'],
  expandedSnapshotId: null,

  setSnapshots: (snapshots) => set({ snapshots }),
  setConflicts: (conflicts) => set({ conflicts }),
  setAIDraft: (currentAIDraft) => set({ currentAIDraft }),
  setCurrentBranch: (currentBranch) => set({ currentBranch }),
  setAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setBranches: (branches) => set({ branches }),
  setAICommitSuggestion: (aiCommitSuggestion) => set({ aiCommitSuggestion }),
  
  toggleSection: (sectionId) => set((state) => ({
    expandedSections: state.expandedSections.includes(sectionId)
      ? state.expandedSections.filter(id => id !== sectionId)
      : [...state.expandedSections, sectionId]
  })),

  setExpandedSnapshotId: (id) => set((state) => ({
    expandedSnapshotId: state.expandedSnapshotId === id ? null : id
  })),

  handleMessage: (event) => {
    // 실제 백엔드 이벤트 수신 처리
    const { command, payload } = event.data;
    console.log('[Webview] Received message from extension:', command, payload);
  },


}));
