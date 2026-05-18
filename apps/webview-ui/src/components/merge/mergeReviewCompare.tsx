import React, { useEffect, useMemo, useRef } from 'react';
import type { MergeConflictCandidateView, MergeConflictRegion } from '@gitcat/shared-types';

export type MergeCompareTab = 'two-way' | 'base';

/** DOM 행 수 상한 — full-file 로드 후에도 웹뷰가 멈추지 않도록 */
const MAX_RENDER_LINES = 2_000;

export function useFullFileCompare(conflict: MergeConflictCandidateView): boolean {
  return conflict.conflictKind === 'full_file'
    || conflict.conflictKind === 'add_add'
    || !!(conflict.sourceFullContent && conflict.targetFullContent);
}

export function pickCompareContent(
  conflict: MergeConflictCandidateView,
  side: 'incoming' | 'current' | 'base',
  region?: MergeConflictRegion | null,
): string {
  if (side === 'base') {
    return conflict.baseFullContent ?? conflict.baseExcerpt ?? '';
  }

  const useFull = useFullFileCompare(conflict);
  if (useFull) {
    return side === 'incoming'
      ? (conflict.targetFullContent ?? conflict.targetExcerpt ?? '')
      : (conflict.sourceFullContent ?? conflict.sourceExcerpt ?? '');
  }

  if (region) {
    return side === 'incoming'
      ? (region.targetExcerpt ?? conflict.targetExcerpt ?? '')
      : (region.sourceExcerpt ?? conflict.sourceExcerpt ?? '');
  }

  return side === 'incoming'
    ? (conflict.targetExcerpt ?? '')
    : (conflict.sourceExcerpt ?? '');
}

function renderHighlightedLines(
  content: string,
  lineStart: number,
  lineEnd: number,
): React.ReactNode {
  return content.split('\n').map((line, index) => {
    const lineNo = index + 1;
    const inRange = lineNo >= lineStart && lineNo <= lineEnd;
    return (
      <div
        key={lineNo}
        data-line={lineNo}
        style={{
          display: 'flex',
          background: inRange
            ? 'color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent)'
            : 'transparent',
        }}
      >
        <span style={{
          minWidth: 32, textAlign: 'right', paddingRight: 8, flexShrink: 0,
          fontSize: 10, opacity: 0.45, userSelect: 'none',
        }}>
          {lineNo}
        </span>
        <span style={{ flex: 1, paddingLeft: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {line || ' '}
        </span>
      </div>
    );
  });
}

export const ViewTabBar: React.FC<{
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}> = ({ tabs, active, onChange }) => (
  <div style={{
    flexShrink: 0, display: 'flex', gap: 4, padding: '6px 10px',
    borderBottom: '1px solid var(--vscode-panel-border)',
    background: 'var(--vscode-sideBarSectionHeader-background)',
  }}>
    {tabs.map((tab) => {
      const selected = tab.id === active;
      return (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          style={{
            padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: selected ? 700 : 500,
            border: `1px solid ${selected ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)'}`,
            background: selected
              ? 'color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent)'
              : 'transparent',
            color: selected ? 'var(--vscode-focusBorder)' : 'var(--vscode-descriptionForeground)',
            cursor: 'pointer',
          }}
        >
          {tab.label}
        </button>
      );
    })}
  </div>
);

export const RegionChipBar: React.FC<{
  regions: MergeConflictRegion[];
  activeRegionId: string | null;
  onSelect: (regionId: string) => void;
}> = ({ regions, activeRegionId, onSelect }) => (
  <div style={{
    flexShrink: 0, padding: '6px 12px', display: 'flex', flexWrap: 'wrap', gap: 6,
    borderBottom: '1px solid var(--vscode-panel-border)',
    background: 'var(--vscode-sideBarSectionHeader-background)',
  }}>
    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--vscode-descriptionForeground)', alignSelf: 'center' }}>
      검토 구간:
    </span>
    {regions.map((region) => {
      const selected = region.id === activeRegionId;
      return (
        <button
          key={region.id}
          type="button"
          onClick={() => onSelect(region.id)}
          style={{
            padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: selected ? 700 : 400,
            border: `1px solid ${selected ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)'}`,
            background: selected
              ? 'color-mix(in srgb, var(--vscode-focusBorder) 15%, transparent)'
              : 'transparent',
            color: selected ? 'var(--vscode-focusBorder)' : 'var(--vscode-descriptionForeground)',
            cursor: 'pointer',
          }}
        >
          {region.label}
        </button>
      );
    })}
  </div>
);

export const PlainCodeColumn: React.FC<{
  label: string;
  colorVar: string;
  content: string;
  highlightStart?: number;
  highlightEnd?: number;
  scrollToLine?: number;
  hasBorderRight?: boolean;
}> = ({ label, colorVar, content, highlightStart, highlightEnd, scrollToLine, hasBorderRight }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollToLine || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-line="${scrollToLine}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [scrollToLine]);

  const body = useMemo(() => {
    if (!content) {
      return <span style={{ opacity: 0.4 }}>내용 없음</span>;
    }
    if (highlightStart != null && highlightEnd != null) {
      return renderHighlightedLines(content, highlightStart, highlightEnd);
    }
    const lines = content.split('\n');
    const truncated = lines.length > MAX_RENDER_LINES;
    const visible = truncated ? lines.slice(0, MAX_RENDER_LINES) : lines;
    return (
      <>
        {truncated && (
          <div style={{ padding: '4px 0 8px', fontSize: 10, opacity: 0.65 }}>
            {`… 상위 ${MAX_RENDER_LINES}줄만 표시 (${lines.length.toLocaleString()}줄 중)`}
          </div>
        )}
        {visible.map((line, index) => (
          <div key={index} data-line={index + 1} style={{ display: 'flex' }}>
            <span style={{ minWidth: 32, textAlign: 'right', paddingRight: 8, fontSize: 10, opacity: 0.45 }}>
              {index + 1}
            </span>
            <span style={{ flex: 1, paddingLeft: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {line || ' '}
            </span>
          </div>
        ))}
      </>
    );
  }, [content, highlightEnd, highlightStart]);

  return (
    <div style={{
      flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      borderRight: hasBorderRight ? '1px solid var(--vscode-panel-border)' : undefined,
    }}>
      <div style={{
        flexShrink: 0, padding: '4px 10px', fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.05em', color: colorVar,
        borderBottom: '1px solid var(--vscode-panel-border)',
        background: `color-mix(in srgb, ${colorVar} 8%, var(--vscode-editor-background))`,
      }}>
        {label}
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        <pre style={{
          margin: 0, fontFamily: 'var(--vscode-editor-font-family, monospace)',
          fontSize: 12, lineHeight: 1.6,
        }}>
          {body}
        </pre>
      </div>
    </div>
  );
};
