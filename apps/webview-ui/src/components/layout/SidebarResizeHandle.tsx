import React, { useCallback, useRef, useState } from 'react';

export interface SidebarResizeHandleProps {
  /**
   * false 이면 렌더하지 않음. SidebarLayout 은 열린 섹션 쌍에만 마운트하므로 보통 true.
   */
  visible: boolean;
  /** 드래그 시작 시 위/아래 섹션의 현재 픽셀 높이를 얻기 위한 콜백 */
  getAboveHeight: () => number;
  getBelowHeight: () => number;
  /** 드래그 시작 시 위/아래 섹션의 현재 flex-grow 가중치를 얻기 위한 콜백 */
  getAboveWeight: () => number;
  getBelowWeight: () => number;
  /** 가중치 변경 콜백. 두 섹션의 가중치 합은 보존된다(다른 섹션엔 영향 없음). */
  onWeightsChange: (newAboveWeight: number, newBelowWeight: number) => void;
  /** 키보드 미세조정 시 한 번에 이동할 픽셀 양 (기본 16) */
  keyboardStepPx?: number;
  /** 위/아래 섹션이 가질 수 있는 최소 픽셀 높이 (헤더만 보이는 정도 이상) */
  minSectionPx?: number;
  /** 접근성을 위한 라벨 (예: "Files와 Snapshots 사이 리사이즈") */
  ariaLabel?: string;
}

/**
 * 사이드바 섹션 사이에 들어가는 세로 리사이즈 핸들.
 *
 * UX:
 * - 기본 상태: 4px 높이의 투명 hit area + 가운데 1px 분리선(panel-border 색)
 * - hover/focus: 1px 분리선이 focusBorder 색으로 강조 + 굵기 1px → 2px
 * - drag: 위쪽 섹션이 위로 자라면 (clientY 증가 = 아래로 이동 = 위 섹션이 커짐) 위/아래 가중치를 재분배
 * - 키보드: ↑/↓ 로 keyboardStepPx 만큼 미세조정 (접근성)
 */
export const SidebarResizeHandle: React.FC<SidebarResizeHandleProps> = ({
  visible,
  getAboveHeight,
  getBelowHeight,
  getAboveWeight,
  getBelowWeight,
  onWeightsChange,
  keyboardStepPx = 16,
  minSectionPx = 80,
  ariaLabel = '인접 섹션 높이 조절',
}) => {
  const [isHover, setIsHover] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startY: number;
    aboveH: number;
    belowH: number;
    totalH: number;
    totalW: number;
  } | null>(null);

  const applyDelta = useCallback(
    (deltaPx: number) => {
      const aboveH = getAboveHeight();
      const belowH = getBelowHeight();
      const totalH = aboveH + belowH;
      if (totalH <= 0) return;
      const totalW = getAboveWeight() + getBelowWeight();
      if (totalW <= 0) return;
      const newAboveH = Math.max(minSectionPx, Math.min(totalH - minSectionPx, aboveH + deltaPx));
      const ratio = newAboveH / totalH;
      const newAboveW = ratio * totalW;
      const newBelowW = totalW - newAboveW;
      onWeightsChange(newAboveW, newBelowW);
    },
    [getAboveHeight, getBelowHeight, getAboveWeight, getBelowWeight, onWeightsChange, minSectionPx],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!visible) return;
      e.preventDefault();
      const aboveH = getAboveHeight();
      const belowH = getBelowHeight();
      dragStateRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        aboveH,
        belowH,
        totalH: aboveH + belowH,
        totalW: getAboveWeight() + getBelowWeight(),
      };
      setIsDragging(true);
      try {
        (e.target as Element).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [visible, getAboveHeight, getBelowHeight, getAboveWeight, getBelowWeight],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !dragStateRef.current) return;
      // 드래그 중에는 시작 시점의 totalH/totalW 를 기준으로 계산해 부드럽게 동작
      const state = dragStateRef.current;
      const delta = e.clientY - state.startY;
      const newAboveH = Math.max(minSectionPx, Math.min(state.totalH - minSectionPx, state.aboveH + delta));
      const ratio = newAboveH / state.totalH;
      const newAboveW = ratio * state.totalW;
      const newBelowW = state.totalW - newAboveW;
      onWeightsChange(newAboveW, newBelowW);
    },
    [isDragging, onWeightsChange, minSectionPx],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      setIsDragging(false);
      const state = dragStateRef.current;
      dragStateRef.current = null;
      if (state) {
        try {
          (e.target as Element).releasePointerCapture(state.pointerId);
        } catch {
          /* ignore */
        }
      }
    },
    [isDragging],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!visible) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        applyDelta(-keyboardStepPx);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        applyDelta(keyboardStepPx);
      }
    },
    [visible, applyDelta, keyboardStepPx],
  );

  if (!visible) return null;

  const highlighted = isHover || isDragging;

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerEnter={() => setIsHover(true)}
      onPointerLeave={() => setIsHover(false)}
      onKeyDown={handleKeyDown}
      style={{
        height: '4px',
        cursor: 'ns-resize',
        flexShrink: 0,
        position: 'relative',
        outline: 'none',
        touchAction: 'none',
        // hit area 자체는 투명, 가운데 ::after 대신 inner div로 분리선 표현
        background: 'transparent',
        zIndex: 1,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          height: highlighted ? '2px' : '1px',
          background: highlighted
            ? 'var(--vscode-focusBorder, var(--vscode-panel-border))'
            : 'var(--vscode-panel-border)',
          transition: isDragging ? 'none' : 'background 0.12s, height 0.12s',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
