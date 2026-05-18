import React, { useState, useEffect } from 'react';
import { useGitCatStore } from '../../store/useGitCatStore';
import { useVsCodeApi } from '../../hooks/useVsCodeApi';
import { Check, X, Edit3, ShieldCheck, Info, Sparkles, ArrowLeft } from 'lucide-react';
import {
  PlainCodeColumn,
  RegionChipBar,
  ViewTabBar,
  pickCompareContent,
  useFullFileCompare,
  type MergeCompareTab,
} from './mergeReviewCompare';

// ─── 헬퍼: diff 텍스트에서 편집 가능한 순수 콘텐츠 추출 ──────────────────────
// +/- 마커와 헤더 라인을 제거하고 최종 결과 파일 내용만 반환
function diffToEditableContent(diffText: string): string {
  if (!diffText) return diffText;
  // unified diff 형식이 아니면 그대로 반환
  if (!diffText.includes('@@') && !diffText.startsWith('diff ')) return diffText;

  return diffText
    .split('\n')
    .filter(line =>
      !line.startsWith('---') &&
      !line.startsWith('+++') &&
      !line.startsWith('@@') &&
      !line.startsWith('diff ') &&
      !line.startsWith('index ') &&
      !(line.startsWith('-') && !line.startsWith('---')) // 삭제 라인 제거
    )
    .map(line => {
      if (line.startsWith('+') && !line.startsWith('+++')) return line.slice(1); // + 마커 제거
      if (line.startsWith(' ')) return line.slice(1); // 컨텍스트 앞 공백 제거
      return line;
    })
    .join('\n');
}

// ─── 헬퍼: diff에서 충돌 클러스터(연속된 -/+ 블록) 수 파악 ──────────────────
function countConflictClusters(diffText: string): number {
  if (!diffText) return 0;
  let count = 0;
  let inConflict = false;
  for (const line of diffText.split('\n')) {
    const isConflict =
      (line.startsWith('-') && !line.startsWith('---')) ||
      (line.startsWith('+') && !line.startsWith('+++'));
    if (isConflict && !inConflict) { count++; inConflict = true; }
    else if (!isConflict) { inConflict = false; }
  }
  return count;
}

// ─── 헬퍼: 텍스트가 unified diff 형식인지 판별 ───────────────────────────────
function isDiffFormat(text: string): boolean {
  if (!text) return false;
  const lines = text.split('\n');
  return lines.some(line =>
    line.startsWith('@@') ||
    line.startsWith('diff ') ||
    ((line.startsWith('+') && !line.startsWith('+++')) ||
     (line.startsWith('-') && !line.startsWith('---')))
  );
}

// ─── 헬퍼: diff 컨텍스트 축약 (충돌 구간 ±N줄만 유지, 나머지는 ~~N~~ 마커) ─
const CONTEXT_LINES = 4;
function trimDiffContext(diffText: string, ctx: number = CONTEXT_LINES): string {
  if (!diffText) return diffText;
  // plain text(AI가 반환한 최종 merged code)는 trimming 없이 그대로 반환
  if (!isDiffFormat(diffText)) return diffText;
  const lines = diffText.split('\n');

  // 항상 유지할 헤더 라인
  const keepSet = new Set<number>();
  lines.forEach((line, i) => {
    if (
      line.startsWith('@@') || line.startsWith('diff ') ||
      line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')
    ) { keepSet.add(i); }
  });

  // 충돌 라인 주변 ctx줄씩 유지
  lines.forEach((line, i) => {
    const isConflict =
      (line.startsWith('+') && !line.startsWith('+++')) ||
      (line.startsWith('-') && !line.startsWith('---'));
    if (isConflict) {
      for (let j = Math.max(0, i - ctx); j <= Math.min(lines.length - 1, i + ctx); j++) {
        keepSet.add(j);
      }
    }
  });

  if (keepSet.size >= lines.length) return diffText; // 모두 유지

  const result: string[] = [];
  let lastKept = -1;
  lines.forEach((line, i) => {
    if (keepSet.has(i)) {
      if (lastKept >= 0 && i > lastKept + 1) {
        result.push(`~~${i - lastKept - 1}~~`);
      }
      result.push(line);
      lastKept = i;
    }
  });
  return result.join('\n');
}

// ─── 헬퍼: @@ 헤더에서 시작 줄 번호 파싱 ────────────────────────────────────
function parseHunkNumbers(line: string): { old: number; new: number } | null {
  const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  return m ? { old: parseInt(m[1]), new: parseInt(m[2]) } : null;
}

// ─── 헬퍼: 줄 번호 표시 셀 ───────────────────────────────────────────────────
const LineNum: React.FC<{ num: string | number }> = ({ num }) => (
  <span style={{
    minWidth: 32, textAlign: 'right', paddingRight: 8, flexShrink: 0,
    fontSize: 10, lineHeight: 'inherit', userSelect: 'none',
    color: 'var(--vscode-editorLineNumber-foreground, var(--vscode-descriptionForeground))',
    opacity: 0.45, fontFamily: 'var(--vscode-editor-font-family, monospace)',
  }}>
    {num}
  </span>
);

// ─── 헬퍼: diff 라인 렌더링 (줄 번호 + 생략 마커 포함) ──────────────────────
function renderDiffLines(text: string): React.ReactNode {
  if (!text) return <span style={{ opacity: 0.4 }}>내용 없음</span>;

  // plain text(AI merged code): 줄 번호만 붙여 그대로 렌더링
  if (!isDiffFormat(text)) {
    return text.split('\n').map((line, i) => (
      <div key={i} style={{ display: 'flex', background: 'transparent' }}>
        <LineNum num={i + 1} />
        <span style={{
          flex: 1, paddingLeft: 4, fontWeight: 'normal',
          color: 'var(--vscode-editor-foreground)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {line || ' '}
        </span>
      </div>
    ));
  }

  let lineOld = 1;
  let lineNew = 1;

  return text.split('\n').map((line, i) => {
    // ~~N~~ 생략 마커
    const skipMatch = line.match(/^~~(\d+)~~$/);
    if (skipMatch) {
      const n = parseInt(skipMatch[1]);
      lineOld += n;
      lineNew += n;
      return (
        <div key={i} style={{
          display: 'flex', alignItems: 'center',
          background: 'color-mix(in srgb, var(--vscode-descriptionForeground) 5%, transparent)',
        }}>
          <LineNum num="↕" />
          <span style={{ paddingLeft: 4, fontSize: 10, fontStyle: 'italic', opacity: 0.45, color: 'var(--vscode-descriptionForeground)' }}>
            {n}줄 생략
          </span>
        </div>
      );
    }

    const isAdded = line.startsWith('+') && !line.startsWith('+++');
    const isRemoved = line.startsWith('-') && !line.startsWith('---');
    const isHunkHeader = line.startsWith('@@');
    const isFileHeader =
      line.startsWith('diff ') || line.startsWith('index ') ||
      line.startsWith('---') || line.startsWith('+++');

    // diff --git / index / --- / +++ 는 렌더링하지 않음 (줄번호만 업데이트)
    if (isFileHeader) return null;

    let displayNum: string | number = '';
    if (isHunkHeader) {
      const nums = parseHunkNumbers(line);
      if (nums) { lineOld = nums.old; lineNew = nums.new; }
    } else {
      if (isAdded)       { displayNum = lineNew++; }
      else if (isRemoved){ displayNum = lineOld++; }
      else               { displayNum = lineNew; lineOld++; lineNew++; }
    }

    return (
      <div key={i} style={{
        display: 'flex',
        background: isAdded
          ? 'color-mix(in srgb, var(--vscode-charts-green, #89d185) 18%, transparent)'
          : isRemoved
            ? 'color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 18%, transparent)'
            : isHunkHeader
              ? 'color-mix(in srgb, var(--vscode-charts-blue, #75beff) 6%, transparent)'
              : 'transparent',
        color: isAdded
          ? 'var(--vscode-charts-green, #89d185)'
          : isRemoved
            ? 'var(--vscode-charts-red, #f14c4c)'
            : isHunkHeader
              ? 'var(--vscode-descriptionForeground)'
              : 'var(--vscode-editor-foreground)',
      }}>
        <LineNum num={displayNum} />
        <span style={{
          flex: 1, paddingLeft: isHunkHeader ? 0 : 4,
          fontWeight: 'normal', opacity: isHunkHeader ? 0.55 : 1,
          fontSize: isHunkHeader ? 10 : undefined,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {line || ' '}
        </span>
      </div>
    );
  });
}

// ─── 헬퍼: 클러스터 선택 상태를 반영한 diff 렌더링 (줄 번호 포함) ───────────
// 각 충돌 클러스터(연속 -/+ 블록)를 클릭 가능한 단위로 그룹화
function renderDiffWithClusterSelection(
  text: string,
  selectedClusters: Set<number>,
  onToggle: (id: number) => void
): React.ReactNode {
  if (!text) return <span style={{ opacity: 0.4 }}>내용 없음</span>;

  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let clusterIndex = -1;
  let i = 0;

  // 줄 번호를 미리 계산 (~~N~~ 생략 마커 포함)
  const lineNums: (string | number)[] = [];
  {
    let lo = 1, ln = 1;
    for (const line of lines) {
      const skipM = line.match(/^~~(\d+)~~$/);
      if (skipM) { const n = parseInt(skipM[1]); lo += n; ln += n; lineNums.push('↕'); continue; }
      const isHdr = line.startsWith('@@');
      const isFile = line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++');
      const isAdded = line.startsWith('+') && !line.startsWith('+++');
      const isRemoved = line.startsWith('-') && !line.startsWith('---');
      if (isHdr) {
        const nums = parseHunkNumbers(line);
        if (nums) { lo = nums.old; ln = nums.new; }
        lineNums.push('');
      } else if (isFile) {
        lineNums.push('');
      } else if (isAdded) {
        lineNums.push(ln++);
      } else if (isRemoved) {
        lineNums.push(lo++);
      } else {
        lineNums.push(ln); lo++; ln++;
      }
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const lineNum = lineNums[i];

    // ~~N~~ 생략 마커
    const skipMatch = line.match(/^~~(\d+)~~$/);
    if (skipMatch) {
      result.push(
        <div key={`skip-${i}`} style={{
          display: 'flex', alignItems: 'center',
          background: 'color-mix(in srgb, var(--vscode-descriptionForeground) 5%, transparent)',
        }}>
          <LineNum num="↕" />
          <span style={{ paddingLeft: 4, fontSize: 10, fontStyle: 'italic', opacity: 0.45, color: 'var(--vscode-descriptionForeground)' }}>
            {skipMatch[1]}줄 생략
          </span>
        </div>
      );
      i++;
      continue;
    }

    // 헤더 라인 처리
    const isHunkHeader = line.startsWith('@@');
    const isFileHeader =
      line.startsWith('diff ') || line.startsWith('index ') ||
      line.startsWith('---') || line.startsWith('+++');

    if (isHunkHeader || isFileHeader) {
      if (isHunkHeader) {
        // @@ 헝크 헤더는 연하게 표시
        result.push(
          <div key={`h-${i}`} style={{
            display: 'flex',
            background: 'color-mix(in srgb, var(--vscode-charts-blue, #75beff) 6%, transparent)',
          }}>
            <LineNum num="" />
            <span style={{
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              fontSize: 10, opacity: 0.55,
              color: 'var(--vscode-descriptionForeground)',
            }}>{line}</span>
          </div>
        );
      }
      // diff --git / index / --- / +++ 는 렌더링하지 않음
      i++;
      continue;
    }

    // 충돌 클러스터 (연속된 -/+ 라인 블록)
    const isConflictLine =
      (line.startsWith('-') && !line.startsWith('---')) ||
      (line.startsWith('+') && !line.startsWith('+++'));

    if (isConflictLine) {
      clusterIndex++;
      const currentCluster = clusterIndex;
      const isSelected = selectedClusters.has(currentCluster);
      const clusterLineNodes: React.ReactNode[] = [];

      while (i < lines.length) {
        const l = lines[i];
        const ln = lineNums[i];
        const isCL =
          (l.startsWith('-') && !l.startsWith('---')) ||
          (l.startsWith('+') && !l.startsWith('+++'));
        if (!isCL) break;

        const isAdded = l.startsWith('+');
        clusterLineNodes.push(
          <div key={i} style={{
            display: 'flex',
            background: isAdded
              ? `color-mix(in srgb, var(--vscode-charts-green, #89d185) ${isSelected ? 22 : 7}%, transparent)`
              : `color-mix(in srgb, var(--vscode-charts-red, #f14c4c) ${isSelected ? 22 : 7}%, transparent)`,
            color: isAdded
              ? 'var(--vscode-charts-green, #89d185)'
              : 'var(--vscode-charts-red, #f14c4c)',
            opacity: isSelected ? 1 : 0.45,
          }}>
            <LineNum num={ln} />
            <span style={{ flex: 1, paddingLeft: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{l}</span>
          </div>
        );
        i++;
      }

      result.push(
        <div
          key={`cluster-${currentCluster}`}
          onClick={() => onToggle(currentCluster)}
          title={isSelected ? '클릭하여 이 구간 제외' : '클릭하여 이 구간 선택'}
          style={{
            borderLeft: `3px solid ${isSelected ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)'}`,
            marginLeft: 2,
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
        >
          {clusterLineNodes}
        </div>
      );
      continue;
    }

    // 컨텍스트 라인
    result.push(
      <div key={i} style={{ display: 'flex', color: 'var(--vscode-editor-foreground)' }}>
        <LineNum num={lineNum} />
        <span style={{ flex: 1, paddingLeft: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line || ' '}</span>
      </div>
    );
    i++;
  }

  return result;
}

// ─── severity 매핑 ────────────────────────────────────────────────────────────
const SEVERITY_LABEL: Record<string, string> = {
  high: '⚠ 높음', medium: '⚠ 중간', low: '● 낮음',
};
const SEVERITY_COLOR: Record<string, string> = {
  high: 'var(--vscode-charts-red, #f14c4c)',
  medium: 'var(--vscode-editorWarning-foreground, #cca700)',
  low: 'var(--vscode-charts-blue, #75beff)',
};

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export const AIDraftPanel: React.FC = () => {
  const {
    currentAIDraft, isMergeProposalLoading,
    selectedConflict, setSelectedConflict,
    beginMergeFeedback, pendingMergeFeedback,
    getCandidateResolvedStatus, appliedFileContents,
  } = useGitCatStore();
  const { sendMessage } = useVsCodeApi();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [draftTab, setDraftTab] = useState<'compare' | 'draft'>('draft');

  // draft가 바뀌면 편집 상태 초기화 (편집 textarea에는 순수 콘텐츠만)
  useEffect(() => {
    setIsEditing(false);
    setEditedContent(diffToEditableContent(currentAIDraft?.proposedContent ?? ''));
  }, [currentAIDraft]);

  useEffect(() => {
    setDraftTab('draft');
  }, [currentAIDraft?.proposalId]);

  useEffect(() => {
    if (!selectedConflict?.compareContentTruncated) {
      return;
    }
    sendMessage('GET_MERGE_COMPARE_CONTENT', {
      analysisId: selectedConflict.analysisId,
      candidateId: selectedConflict.candidateId,
    });
  }, [
    selectedConflict?.analysisId,
    selectedConflict?.candidateId,
    selectedConflict?.compareContentTruncated,
    sendMessage,
  ]);

  if (isMergeProposalLoading && !currentAIDraft) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 10, padding: 24,
        color: 'var(--vscode-foreground)', opacity: 0.8,
      }}>
        <div style={{
          width: 24, height: 24,
          border: '2.5px solid color-mix(in srgb, var(--vscode-focusBorder) 30%, transparent)',
          borderTopColor: 'var(--vscode-focusBorder)',
          borderRadius: '50%',
          animation: 'gitcat-refresh-spin 0.75s linear infinite',
        }} />
        <p style={{ fontSize: 12, margin: 0 }}>AI 병합 초안을 분석하는 중입니다…</p>
      </div>
    );
  }

  if (!currentAIDraft && selectedConflict) {
    const resolvedStatus = getCandidateResolvedStatus(selectedConflict);
    const appliedContent = appliedFileContents[selectedConflict.filePath];

    if (resolvedStatus === 'accepted' && appliedContent != null) {
      return (
        <AppliedContentPreview
          conflict={selectedConflict}
          content={appliedContent}
          onBack={() => setSelectedConflict(null)}
        />
      );
    }

    if (resolvedStatus === 'rejected') {
      return (
        <RejectedContentPreview
          conflict={selectedConflict}
          onBack={() => setSelectedConflict(null)}
          onRequestAI={(hunks) => {
            sendMessage('GET_AI_DRAFT', {
              analysisId: selectedConflict.analysisId,
              candidateId: selectedConflict.candidateId,
              filePath: selectedConflict.filePath,
              featureType: 'merge_patch_draft',
              ...(hunks && hunks.length > 0 && { selectedHunks: hunks }),
            });
          }}
        />
      );
    }

    return (
      <ConflictPreview
        conflict={selectedConflict}
        isLoading={isMergeProposalLoading}
        onRequestAI={(hunks) => {
          sendMessage('GET_AI_DRAFT', {
            analysisId: selectedConflict.analysisId,
            candidateId: selectedConflict.candidateId,
            filePath: selectedConflict.filePath,
            featureType: 'merge_patch_draft',
            ...(hunks && hunks.length > 0 && { selectedHunks: hunks }),
          });
        }}
        onBack={() => setSelectedConflict(null)}
      />
    );
  }

  if (!currentAIDraft) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 8, padding: 24,
        opacity: 0.45, textAlign: 'center', color: 'var(--vscode-foreground)',
      }}>
        <ShieldCheck size={38} />
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>병합 분석 대기 중</p>
        <p style={{ fontSize: 11, margin: 0, lineHeight: 1.6, maxWidth: 260 }}>
          아래 충돌 후보를 선택하면 이곳에 AI 중재안이 표시됩니다.
        </p>
      </div>
    );
  }

  const isFeedbackSubmitting = pendingMergeFeedback?.candidateId === currentAIDraft.candidateId;

  const handleApprove = (content?: string) => {
    if (isFeedbackSubmitting) return;
    const proposedContent = content ?? currentAIDraft.proposedContent;
    const finalContent = diffToEditableContent(proposedContent);
    beginMergeFeedback({
      candidateId: currentAIDraft.candidateId,
      filePath: currentAIDraft.filePath,
      status: 'accepted',
      proposedContent: finalContent,
    });
    sendMessage('ACCEPT_MERGE', {
      proposalId: currentAIDraft.proposalId,
      candidateId: currentAIDraft.candidateId,
      analysisId: currentAIDraft.analysisId,
      filePath: currentAIDraft.filePath,
      proposedContent: finalContent,
      finalExplanation: currentAIDraft.explanation,
    });
  };

  const handleReject = () => {
    if (isFeedbackSubmitting) return;
    beginMergeFeedback({
      candidateId: currentAIDraft.candidateId,
      filePath: currentAIDraft.filePath,
      status: 'rejected',
    });
    sendMessage('REJECT_MERGE', {
      proposalId: currentAIDraft.proposalId,
      candidateId: currentAIDraft.candidateId,
      analysisId: currentAIDraft.analysisId,
      filePath: currentAIDraft.filePath,
    });
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      overflow: 'hidden',
      background: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px',
        borderBottom: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-sideBarSectionHeader-background)',
        overflow: 'hidden',
      }}>
        <span style={{
          flexShrink: 0, padding: '2px 7px', borderRadius: 3,
          background: 'color-mix(in srgb, var(--vscode-charts-purple, #c586c0) 15%, transparent)',
          color: 'var(--vscode-charts-purple, #c586c0)',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          AI Mediation
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{
            fontSize: 12, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--vscode-foreground)',
          }}>
            {currentAIDraft.filePath.split('/').pop() ?? currentAIDraft.filePath}
          </span>
          <span style={{
            fontSize: 10, color: 'var(--vscode-descriptionForeground)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.7,
          }}>
            {currentAIDraft.filePath.includes('/')
              ? currentAIDraft.filePath.substring(0, currentAIDraft.filePath.lastIndexOf('/'))
              : '/ (루트 디렉토리)'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {isFeedbackSubmitting ? (
            <span style={{ fontSize: 11, opacity: 0.75, color: 'var(--vscode-descriptionForeground)' }}>
              {pendingMergeFeedback?.status === 'accepted' ? '반영 중…' : '처리 중…'}
            </span>
          ) : isEditing ? (
            <>
              <button
                onClick={() => { setIsEditing(false); setEditedContent(diffToEditableContent(currentAIDraft.proposedContent)); }}
                className="gitcat-header-btn"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 3,
                  border: '1px solid var(--vscode-button-border, var(--vscode-panel-border))',
                  background: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <X size={12} /> 편집 취소
              </button>
              <button
                onClick={() => handleApprove(editedContent)}
                className="gitcat-header-btn"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 12px', borderRadius: 3, border: 'none',
                  background: 'var(--vscode-button-background)',
                  color: 'var(--vscode-button-foreground)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Check size={12} /> 수정 내용 반영
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleReject}
                className="gitcat-header-btn"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 3,
                  border: '1px solid var(--vscode-button-border, var(--vscode-panel-border))',
                  background: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <X size={12} /> 반영 안 함
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="gitcat-header-btn"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 3,
                  border: '1px solid var(--vscode-button-border, var(--vscode-panel-border))',
                  background: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Edit3 size={12} /> 수정 후 반영
              </button>
              <button
                onClick={() => handleApprove()}
                className="gitcat-header-btn"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 12px', borderRadius: 3, border: 'none',
                  background: 'var(--vscode-button-background)',
                  color: 'var(--vscode-button-foreground)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Check size={12} /> 최종 반영
              </button>
            </>
          )}
        </div>
      </div>

      <ViewTabBar
        tabs={[
          { id: 'compare', label: '2열 비교 (상대·내)' },
          { id: 'draft', label: 'AI 병합 초안' },
        ]}
        active={draftTab}
        onChange={(id) => setDraftTab(id as 'compare' | 'draft')}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {draftTab === 'compare' ? (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
            <DiffColumn
              label="상대 변경사항 (Incoming)"
              colorVar="var(--vscode-charts-blue, #75beff)"
              content={currentAIDraft.targetContent}
              placeholder="// No incoming changes detected"
              hasBorderRight
            />
            <DiffColumn
              label="내 변경사항 (Current)"
              colorVar="var(--vscode-charts-green, #89d185)"
              content={currentAIDraft.sourceContent}
              placeholder="// No local changes detected"
            />
          </div>
        ) : (
        <div style={{
          flex: 1, minWidth: 0, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          background: 'color-mix(in srgb, var(--vscode-charts-purple, #c586c0) 4%, var(--vscode-editor-background))',
        }}>
          <div style={{
            flexShrink: 0, padding: '4px 10px',
            fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            color: 'var(--vscode-charts-purple, #c586c0)',
            borderBottom: '1px solid var(--vscode-panel-border)',
            background: 'color-mix(in srgb, var(--vscode-charts-purple, #c586c0) 8%, var(--vscode-editor-background))',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--vscode-charts-purple, #c586c0)',
                display: 'inline-block', flexShrink: 0,
                animation: 'gitcat-pulse 2s ease-in-out infinite',
              }} />
              AI 병합 초안 (Result)
            </div>
            <ShieldCheck size={12} />
          </div>

          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {isEditing ? (
              /* 수정 모드: 순수 콘텐츠 textarea (+/- 마커 없음) */
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                spellCheck={false}
                style={{
                  flex: 1, resize: 'none',
                  padding: '10px 12px', margin: 0, border: 'none',
                  outline: '2px solid var(--vscode-focusBorder)',
                  outlineOffset: '-2px',
                  fontFamily: 'var(--vscode-editor-font-family, monospace)',
                  fontSize: 12, lineHeight: 1.5,
                  background: 'var(--vscode-input-background)',
                  color: 'var(--vscode-input-foreground)',
                  width: '100%', boxSizing: 'border-box',
                }}
              />
            ) : (
              /* 보기 모드: diff 하이라이트 적용 */
              <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
                <pre style={{
                  margin: 0,
                  fontFamily: 'var(--vscode-editor-font-family, monospace)',
                  fontSize: 12, lineHeight: 1.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {renderDiffLines(trimDiffContext(currentAIDraft.proposedContent))}
                </pre>
              </div>
            )}
          </div>

          {currentAIDraft.explanation && (
            <div style={{
              flexShrink: 0, padding: '8px 12px',
              borderTop: '1px solid var(--vscode-panel-border)',
              background: 'var(--vscode-editor-inactiveSelectionBackground)',
              display: 'flex', alignItems: 'flex-start', gap: 7,
            }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--vscode-charts-purple, #c586c0)' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 2 }}>AI 중재 근거</div>
                <p style={{ fontSize: 11, margin: 0, lineHeight: 1.5, opacity: 0.85, fontStyle: 'italic' }}>
                  {currentAIDraft.explanation}
                </p>
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};

// ─── 반영 완료 / 반영 안 함 미리보기 ─────────────────────────────────────────

const AppliedContentPreview: React.FC<{
  conflict: import('@gitcat/shared-types').MergeConflictCandidateView;
  content: string;
  onBack: () => void;
}> = ({ conflict, content, onBack }) => {
  const fileName = conflict.filePath.split('/').pop() ?? conflict.filePath;
  const dirPath = conflict.filePath.includes('/')
    ? conflict.filePath.substring(0, conflict.filePath.lastIndexOf('/'))
    : '/ (루트 디렉토리)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      background: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)',
    }}>
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', borderBottom: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-sideBarSectionHeader-background)',
      }}>
        <button type="button" onClick={onBack} title="목록으로" style={{
          border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--vscode-foreground)', opacity: 0.7,
        }}>
          <ArrowLeft size={14} />
        </button>
        <span style={{
          padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700,
          background: 'color-mix(in srgb, var(--vscode-charts-green, #89d185) 18%, transparent)',
          color: 'var(--vscode-charts-green, #89d185)',
        }}>
          반영 완료
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{fileName}</div>
          <div style={{ fontSize: 10, opacity: 0.65, color: 'var(--vscode-descriptionForeground)' }}>{dirPath}</div>
        </div>
      </div>
      <div style={{
        flexShrink: 0, padding: '6px 12px', fontSize: 11, lineHeight: 1.5,
        background: 'var(--vscode-editor-inactiveSelectionBackground)',
        borderBottom: '1px solid var(--vscode-panel-border)',
      }}>
        AI 병합 초안이 로컬 파일에 적용되었습니다. 아래에서 Git Push 등 원래 작업을 다시 시도할 수 있습니다.
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <div style={{
          flexShrink: 0, padding: '4px 10px', fontSize: 10, fontWeight: 700,
          color: 'var(--vscode-charts-green, #89d185)',
          borderBottom: '1px solid var(--vscode-panel-border)',
          background: 'color-mix(in srgb, var(--vscode-charts-green, #89d185) 8%, var(--vscode-editor-background))',
        }}>
          워킹트리에 반영된 내용
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
          <pre style={{
            margin: 0, fontFamily: 'var(--vscode-editor-font-family, monospace)',
            fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {renderDiffLines(content)}
          </pre>
        </div>
      </div>
    </div>
  );
};

const RejectedContentPreview: React.FC<{
  conflict: import('@gitcat/shared-types').MergeConflictCandidateView;
  onBack: () => void;
  onRequestAI: (selectedHunks?: number[]) => void;
}> = ({ conflict, onBack, onRequestAI }) => {
  const fileName = conflict.filePath.split('/').pop() ?? conflict.filePath;
  const dirPath = conflict.filePath.includes('/')
    ? conflict.filePath.substring(0, conflict.filePath.lastIndexOf('/'))
    : '/ (루트 디렉토리)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      background: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)',
    }}>
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', borderBottom: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-sideBarSectionHeader-background)',
      }}>
        <button type="button" onClick={onBack} title="목록으로" style={{
          border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--vscode-foreground)', opacity: 0.7,
        }}>
          <ArrowLeft size={14} />
        </button>
        <span style={{
          padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700,
          background: 'color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 12%, transparent)',
          color: 'color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 80%, var(--vscode-foreground))',
        }}>
          반영 안 함
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{fileName}</div>
          <div style={{ fontSize: 10, opacity: 0.65, color: 'var(--vscode-descriptionForeground)' }}>{dirPath}</div>
        </div>
      </div>
      <div style={{
        flexShrink: 0, padding: '10px 12px', borderTop: '1px solid var(--vscode-panel-border)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, opacity: 0.75 }}>
          이 충돌 후보는 반영하지 않았습니다. 다시 AI 초안을 생성할 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => onRequestAI()}
          className="gitcat-ai-btn"
          style={{
            alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 4, border: 'none',
            background: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Sparkles size={13} /> AI 병합 초안 다시 생성
        </button>
      </div>
    </div>
  );
};

// ─── 2-컬럼 충돌 미리보기 (충돌 구간 선택 포함) ──────────────────────────────

const ConflictPreview: React.FC<{
  conflict: import('@gitcat/shared-types').MergeConflictCandidateView;
  isLoading?: boolean;
  onRequestAI: (selectedHunks?: number[]) => void;
  onBack: () => void;
}> = ({ conflict, isLoading = false, onRequestAI, onBack }) => {
  const fileName = conflict.filePath.split('/').pop() ?? conflict.filePath;
  const dirPath = conflict.filePath.includes('/')
    ? conflict.filePath.substring(0, conflict.filePath.lastIndexOf('/'))
    : '/ (루트 디렉토리)';

  // 충돌 클러스터 수 파악 (targetExcerpt 기준)
  const excerpt = conflict.targetExcerpt ?? conflict.sourceExcerpt ?? '';
  const totalClusters = countConflictClusters(excerpt);

  // 모든 클러스터를 기본으로 선택
  const [selectedClusters, setSelectedClusters] = useState<Set<number>>(() =>
    new Set(Array.from({ length: totalClusters }, (_, i) => i))
  );

  // conflict가 바뀌면 선택 초기화
  useEffect(() => {
    const n = countConflictClusters(conflict.targetExcerpt ?? conflict.sourceExcerpt ?? '');
    setSelectedClusters(new Set(Array.from({ length: n }, (_, i) => i)));
  }, [conflict.candidateId]);

  const toggleCluster = (id: number) => {
    setSelectedClusters(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedClusters(new Set(Array.from({ length: totalClusters }, (_, i) => i)));
  };

  const hasExcerpt = !!(conflict.sourceExcerpt || conflict.targetExcerpt);
  const fullFileMode = useFullFileCompare(conflict);
  const regions = conflict.conflictRegions ?? [];
  const [activeRegionId, setActiveRegionId] = useState<string | null>(regions[0]?.id ?? null);
  const [compareTab, setCompareTab] = useState<MergeCompareTab>('two-way');
  const activeRegion = regions.find((region) => region.id === activeRegionId) ?? regions[0] ?? null;

  useEffect(() => {
    const nextRegions = conflict.conflictRegions ?? [];
    setActiveRegionId(nextRegions[0]?.id ?? null);
    setCompareTab('two-way');
  }, [conflict.candidateId]);

  const canRequestAI = true;
  const showRegionChips = regions.length >= 2 || fullFileMode;
  const incomingContent = pickCompareContent(conflict, 'incoming', activeRegion);
  const currentContent = pickCompareContent(conflict, 'current', activeRegion);
  const baseContent = pickCompareContent(conflict, 'base');

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      overflow: 'hidden',
      background: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px',
        borderBottom: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-sideBarSectionHeader-background)',
        overflow: 'hidden',
      }}>
        <button
          onClick={onBack}
          title="목록으로 돌아가기"
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center',
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--vscode-foreground)', opacity: 0.7, padding: '2px 4px', borderRadius: 3,
          }}
        >
          <ArrowLeft size={14} />
        </button>
        <span style={{
          flexShrink: 0, padding: '2px 7px', borderRadius: 3,
          background: `color-mix(in srgb, ${SEVERITY_COLOR[conflict.severity] ?? 'var(--vscode-charts-blue)'} 15%, transparent)`,
          color: SEVERITY_COLOR[conflict.severity] ?? 'var(--vscode-charts-blue)',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
        }}>
          {SEVERITY_LABEL[conflict.severity] ?? '충돌'}
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName}
          </span>
          <span style={{ fontSize: 10, opacity: 0.65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--vscode-descriptionForeground)' }}>
            {dirPath} · L{conflict.lineStart}–{conflict.lineEnd}
          </span>
        </div>
      </div>

      {/* 충돌 이유 */}
      {conflict.reason && (
        <div style={{
          flexShrink: 0, padding: '6px 12px', fontSize: 11, lineHeight: 1.5,
          background: 'var(--vscode-editor-inactiveSelectionBackground)',
          borderBottom: '1px solid var(--vscode-panel-border)',
          color: 'var(--vscode-foreground)', opacity: 0.85,
        }}>
          {conflict.reason}
        </div>
      )}

      {/* 충돌 구간 선택 툴바 (excerpt가 있고 클러스터가 2개 이상일 때만 표시) */}
      {hasExcerpt && totalClusters >= 2 && (
        <div style={{
          flexShrink: 0, padding: '6px 12px',
          borderBottom: '1px solid var(--vscode-panel-border)',
          background: 'var(--vscode-sideBarSectionHeader-background)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--vscode-descriptionForeground)', flexShrink: 0 }}>
            AI 분석 구간 선택:
          </span>
          {Array.from({ length: totalClusters }, (_, i) => {
            const sel = selectedClusters.has(i);
            return (
              <button
                key={i}
                onClick={() => toggleCluster(i)}
                title={sel ? '클릭하여 제외' : '클릭하여 포함'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 10,
                  border: `1px solid ${sel ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)'}`,
                  background: sel
                    ? 'color-mix(in srgb, var(--vscode-focusBorder) 15%, transparent)'
                    : 'transparent',
                  color: sel ? 'var(--vscode-focusBorder)' : 'var(--vscode-descriptionForeground)',
                  fontSize: 11, fontWeight: sel ? 700 : 400, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {sel ? '✓' : '○'} 구간 {i + 1}
              </button>
            );
          })}
          {selectedClusters.size < totalClusters && (
            <button
              onClick={selectAll}
              style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 3,
                border: '1px solid var(--vscode-panel-border)',
                background: 'transparent',
                color: 'var(--vscode-textLink-foreground)',
                cursor: 'pointer',
              }}
            >
              전체 선택
            </button>
          )}
        </div>
      )}

      {conflict.baseFullContent && (
        <ViewTabBar
          tabs={[
            { id: 'two-way', label: '2열 비교' },
            { id: 'base', label: '공통 조상' },
          ]}
          active={compareTab}
          onChange={(id) => setCompareTab(id as MergeCompareTab)}
        />
      )}

      {showRegionChips && regions.length > 0 && (
        <RegionChipBar
          regions={regions}
          activeRegionId={activeRegionId}
          onSelect={setActiveRegionId}
        />
      )}

      {hasExcerpt || fullFileMode ? (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          {compareTab === 'base' ? (
            <PlainCodeColumn
              label="공통 조상 (Base)"
              colorVar="var(--vscode-descriptionForeground)"
              content={baseContent}
            />
          ) : fullFileMode ? (
            <>
              <PlainCodeColumn
                label="상대 변경사항 (Incoming)"
                colorVar="var(--vscode-charts-blue, #75beff)"
                content={incomingContent}
                highlightStart={activeRegion?.lineStart}
                highlightEnd={activeRegion?.lineEnd}
                scrollToLine={activeRegion?.lineStart}
                hasBorderRight
              />
              <PlainCodeColumn
                label="내 변경사항 (Current)"
                colorVar="var(--vscode-charts-green, #89d185)"
                content={currentContent}
                highlightStart={activeRegion?.lineStart}
                highlightEnd={activeRegion?.lineEnd}
                scrollToLine={activeRegion?.lineStart}
              />
            </>
          ) : (
            <>
              <div style={{
                flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                borderRight: '1px solid var(--vscode-panel-border)',
              }}>
                <div style={{
                  flexShrink: 0, padding: '4px 10px', fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  color: 'var(--vscode-charts-blue, #75beff)',
                  borderBottom: '1px solid var(--vscode-panel-border)',
                  background: 'color-mix(in srgb, var(--vscode-charts-blue, #75beff) 8%, var(--vscode-editor-background))',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--vscode-charts-blue, #75beff)', display: 'inline-block' }} />
                  상대 변경사항 (Incoming)
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
                  <pre style={{ margin: 0, fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: 12, lineHeight: 1.6 }}>
                    {totalClusters >= 2
                      ? renderDiffWithClusterSelection(trimDiffContext(conflict.targetExcerpt ?? ''), selectedClusters, toggleCluster)
                      : renderDiffLines(trimDiffContext(conflict.targetExcerpt ?? ''))}
                  </pre>
                </div>
              </div>
              <div style={{
                flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  flexShrink: 0, padding: '4px 10px', fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  color: 'var(--vscode-charts-green, #89d185)',
                  borderBottom: '1px solid var(--vscode-panel-border)',
                  background: 'color-mix(in srgb, var(--vscode-charts-green, #89d185) 8%, var(--vscode-editor-background))',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--vscode-charts-green, #89d185)', display: 'inline-block' }} />
                  내 변경사항 (Current)
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
                  <pre style={{ margin: 0, fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: 12, lineHeight: 1.6 }}>
                    {totalClusters >= 2
                      ? renderDiffWithClusterSelection(trimDiffContext(conflict.sourceExcerpt ?? ''), selectedClusters, toggleCluster)
                      : renderDiffLines(trimDiffContext(conflict.sourceExcerpt ?? ''))}
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        /* excerpt 없음 */
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 10, padding: 32, textAlign: 'center',
          color: 'var(--vscode-foreground)', opacity: 0.6,
        }}>
          <ShieldCheck size={36} style={{ opacity: 0.5 }} />
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>diff 미리보기를 사용할 수 없습니다</p>
          <p style={{ fontSize: 11, margin: 0, lineHeight: 1.6, maxWidth: 300 }}>
            이 충돌 후보는 이전에 저장된 항목으로 변경 내용 미리보기가 없습니다.
            AI 병합 초안을 생성하면 실제 diff를 확인할 수 있습니다.
          </p>
        </div>
      )}

      {/* AI 분석 요청 버튼 */}
      <div style={{
        flexShrink: 0, padding: '10px 14px',
        borderTop: '1px solid var(--vscode-panel-border)',
        background: 'color-mix(in srgb, var(--vscode-charts-purple, #c586c0) 6%, var(--vscode-editor-background))',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', flex: 1, minWidth: 0 }}>
          {!hasExcerpt
            ? '이미 저장된 충돌 후보입니다. AI 병합 초안을 생성하면 현재 상태를 분석합니다.'
            : hasExcerpt && selectedClusters.size > 0 && selectedClusters.size < totalClusters
              ? `${selectedClusters.size}/${totalClusters}개 구간 선택됨 — 선택한 구간만 AI가 분석합니다.`
              : selectedClusters.size === 0
                ? '구간 미선택 — 전체 충돌 구간을 AI가 분석합니다.'
                : '이 충돌 구간을 AI가 분석하여 병합 초안을 제안합니다.'}
          {conflict.suggestion && (
            <span style={{ display: 'block', marginTop: 2, color: 'var(--vscode-textLink-foreground)', fontStyle: 'italic' }}>
              💡 {conflict.suggestion}
            </span>
          )}
        </span>
        <button
          onClick={() => onRequestAI(
            hasExcerpt && selectedClusters.size > 0 && selectedClusters.size < totalClusters
              ? Array.from(selectedClusters).sort((a, b) => a - b)
              : undefined
          )}
          disabled={isLoading}
          className="gitcat-ai-btn"
          style={{
            flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 4, border: 'none',
            background: !isLoading
              ? 'var(--vscode-button-background)'
              : 'var(--vscode-button-secondaryBackground)',
            color: !isLoading
              ? 'var(--vscode-button-foreground)'
              : 'var(--vscode-button-secondaryForeground)',
            fontSize: 12, fontWeight: 700,
            cursor: !isLoading ? 'pointer' : 'not-allowed',
            opacity: !isLoading ? 1 : 0.7,
            boxShadow: !isLoading ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
          }}
        >
          {isLoading ? (
            <>
              <div style={{
                width: 13, height: 13, flexShrink: 0,
                border: '2px solid color-mix(in srgb, currentColor 30%, transparent)',
                borderTopColor: 'currentColor',
                borderRadius: '50%',
                animation: 'gitcat-refresh-spin 0.75s linear infinite',
              }} />
              AI 분석 중…
            </>
          ) : (
            <>
              <Sparkles size={14} />
              {!hasExcerpt
                ? 'AI 병합 초안 생성'
                : hasExcerpt && selectedClusters.size > 0 && selectedClusters.size < totalClusters
                  ? `구간 ${Array.from(selectedClusters).map(i => i + 1).join(', ')} AI 초안 생성`
                  : 'AI 병합 초안 생성'}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// ─── Diff 컬럼 공통 컴포넌트 (하이라이트 포함) ───────────────────────────────

const DiffColumn: React.FC<{
  label: string;
  colorVar: string;
  content?: string | null;
  placeholder: string;
  hasBorderRight?: boolean;
}> = ({ label, colorVar, content, placeholder, hasBorderRight }) => (
  <div style={{
    flex: 1, minWidth: 0, overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    borderRight: hasBorderRight ? '1px solid var(--vscode-panel-border)' : undefined,
  }}>
    <div style={{
      flexShrink: 0, padding: '4px 10px',
      fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.05em',
      color: colorVar,
      borderBottom: '1px solid var(--vscode-panel-border)',
      background: `color-mix(in srgb, ${colorVar} 8%, var(--vscode-editor-background))`,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: colorVar, display: 'inline-block', flexShrink: 0,
      }} />
      {label}
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
      <pre style={{
        margin: 0,
        fontFamily: 'var(--vscode-editor-font-family, monospace)',
        fontSize: 12, lineHeight: 1.5,
        whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      }}>
        {content ? renderDiffLines(trimDiffContext(content)) : (
          <span style={{ opacity: 0.4 }}>{placeholder}</span>
        )}
      </pre>
    </div>
  </div>
);
