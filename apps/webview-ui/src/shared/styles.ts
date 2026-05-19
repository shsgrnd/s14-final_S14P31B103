/**
 * @file shared/styles.ts
 * @description GitCat Webview 공통 인라인 스타일 유틸리티
 *
 * 모든 스타일은 globals.css의 VS Code 테마 변수(--vscode-*)를 기반으로 합니다.
 * UI 변경 없이 스타일 객체를 중앙에서 관리하기 위해 이 파일을 사용합니다.
 *
 * 사용 방법:
 *   import { btn, iconBtn, input } from '../../shared/styles';
 *   <button style={btn('primary')}>...</button>
 */

import React from 'react';

/**
 * 네이티브 사이드바 **뷰 제목**(GITCAT 한 줄)과 같은 색 계열.
 * `sideBarSectionHeader.foreground`는 OUTLINE 등 접힌 섹션 라벨용이라 어두운 경우가 많아 폴백에 넣지 않음.
 */
export const vscodeSidebarViewTitleForeground =
  'var(--vscode-sideBarTitle-foreground, var(--vscode-titleBar-activeForeground, var(--vscode-tab-activeForeground, var(--vscode-activityBar-foreground, var(--vscode-sideBar-foreground, var(--vscode-editor-foreground))))))';

/**
 * 사이드바 웹뷰 본문. 일부 테마에서 `sideBar.foreground`만 비정상적으로 어두운 경우가 있어
 * workbench `foreground` → `editor.foreground` 순으로 폴백한다.
 */
export const webviewBodyForeground =
  'var(--vscode-foreground, var(--vscode-editor-foreground, var(--vscode-sideBar-foreground)))';

/** 보조 설명문 */
export const webviewDescriptionForeground =
  'var(--vscode-descriptionForeground, var(--vscode-foreground))';

// ─────────────────────────────────────────────
// 버튼 스타일
// ─────────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary';

/**
 * Dark Modern 등 일부 테마에서 secondary 배경/전경이 사이드바와 거의 같아 버튼이 안 보이는 문제 방지.
 */
const primaryBtnBackground =
  'var(--vscode-button-background, var(--vscode-focusBorder))';
const primaryBtnForeground =
  'var(--vscode-button-foreground, var(--vscode-editor-foreground, var(--vscode-foreground)))';
const secondaryBtnBackground =
  'var(--vscode-button-secondaryBackground, var(--vscode-input-background, var(--vscode-list-hoverBackground)))';
const secondaryBtnForeground =
  'var(--vscode-button-secondaryForeground, var(--vscode-foreground, var(--vscode-editor-foreground)))';
const secondaryBtnBorder =
  '1px solid var(--vscode-panel-border, var(--vscode-contrastBorder, rgba(128, 128, 128, 0.45)))';

/** 일반 버튼 (flex: 1, 작은 패딩) — GitActionPanel Create/Cancel 등 */
export const btn = (variant: BtnVariant): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  fontSize: '12px',
  fontWeight: 500,
  padding: '6px 12px',
  borderRadius: '3px',
  cursor: 'pointer',
  border: variant === 'secondary' ? secondaryBtnBorder : 'none',
  flex: 1,
  background: variant === 'primary' ? primaryBtnBackground : secondaryBtnBackground,
  color: variant === 'primary' ? primaryBtnForeground : secondaryBtnForeground,
});

/** 넓은 버튼 (width: 100%, 큰 패딩) — GitActionPanel 메인 액션 그리드 등 */
export const bigBtn = (variant: BtnVariant): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  fontSize: '12px',
  fontWeight: 500,
  height: '30px',
  padding: '0 8px',
  boxSizing: 'border-box',
  borderRadius: '3px',
  cursor: 'pointer',
  border: variant === 'secondary' ? secondaryBtnBorder : 'none',
  width: '100%',
  transition: 'background 0.2s',
  background: variant === 'primary' ? primaryBtnBackground : secondaryBtnBackground,
  color: variant === 'primary' ? primaryBtnForeground : secondaryBtnForeground,
});

/** 인라인 소형 버튼 — AI 추천, 설정 등 */
export const inlineBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '11px',
  fontWeight: 600,
  padding: '4px 8px',
  background: secondaryBtnBackground,
  color: secondaryBtnForeground,
  border: secondaryBtnBorder,
  borderRadius: '3px',
  cursor: 'pointer',
};

/** 아이콘 전용 투명 버튼 — 즐겨찾기, 편집, 삭제 등 */
export const iconBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '3px',
  borderRadius: '3px',
  color: 'var(--vscode-descriptionForeground)',
  display: 'flex',
  alignItems: 'center',
  transition: 'all 0.2s',
};

/** 푸터/헤더용 투명 아이콘 버튼 — 사이드바 하단(뷰 제목 GITCAT과 동일 토큰 계열) */
export const footerIconBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  borderRadius: '3px',
  color: vscodeSidebarViewTitleForeground,
  display: 'flex',
  alignItems: 'center',
};

// ─────────────────────────────────────────────
// 입력 필드 스타일
// ─────────────────────────────────────────────

/** 텍스트 인풋 기본 스타일 */
export const textInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '12px',
  padding: '6px 8px',
  background: 'var(--vscode-input-background)',
  color: 'var(--vscode-input-foreground)',
  border: '1px solid var(--vscode-focusBorder)',
  borderRadius: '3px',
  outline: 'none',
};

/** textarea 기본 스타일 */
export const textArea: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  resize: 'none',
  fontSize: '12px',
  padding: '8px',
  background: 'var(--vscode-input-background)',
  color: 'var(--vscode-input-foreground)',
  border: '1px solid var(--vscode-panel-border)',
  borderRadius: '3px',
  outline: 'none',
  fontFamily: 'inherit',
};

// ─────────────────────────────────────────────
// 리스트 아이템 스타일
// ─────────────────────────────────────────────

/** 선택 가능한 리스트 행 기본 스타일 */
export const listRow = (isActive: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 12px',
  cursor: 'pointer',
  background: isActive
    ? 'var(--vscode-list-activeSelectionBackground)'
    : 'transparent',
  color: isActive
    ? 'var(--vscode-list-activeSelectionForeground)'
    : 'inherit',
});

// ─────────────────────────────────────────────
// 피드백 메시지 스타일
// ─────────────────────────────────────────────

/** 인라인 상태 메시지 (성공/에러) */
export const statusMessage = (ok: boolean): React.CSSProperties => ({
  margin: '8px',
  fontSize: '12px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  color: ok ? 'var(--vscode-charts-green)' : 'var(--vscode-errorForeground)',
});

/** 에러 경고 배너 */
export const errorBanner: React.CSSProperties = {
  margin: '12px 8px 0 8px',
  padding: '8px',
  fontSize: '11px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  color: 'var(--vscode-errorForeground)',
  background: 'var(--vscode-inputValidation-errorBackground)',
  border: '1px solid var(--vscode-inputValidation-errorBorder)',
  borderRadius: '3px',
};
