import React, { useMemo } from 'react';

/**
 * PR description 미리보기에 쓰는 가벼운 마크다운 렌더러.
 *
 * 안전성: 원문을 모두 HTML 이스케이프한 뒤 정해진 토큰만 다시 태그로 치환한다.
 * 따라서 <script>, on* 핸들러, javascript: URL 등은 절대 실행되지 않는다.
 *
 * 지원 문법:
 *  - ATX 헤딩 (#, ##, ###, ####)
 *  - 글머리표 목록 (-, *)
 *  - 번호 목록 (1.)
 *  - 코드 펜스 (```lang ... ```)
 *  - 인용 (> ...)
 *  - 인라인: **bold**, *italic*, `code`, [text](url)
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^(https?:|mailto:|#)/i.test(trimmed)) return trimmed;
  return null;
}

function renderInline(escaped: string): string {
  let out = escaped;

  out = out.replace(/`([^`\n]+)`/g, (_m, code: string) => `<code>${code}</code>`);

  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (_m, pre: string, body: string) => `${pre}<em>${body}</em>`);

  out = out.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_m, text: string, url: string) => {
    const safe = safeUrl(url);
    if (!safe) return `${text}`;
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  return out;
}

function markdownToHtml(src: string): string {
  if (!src.trim()) return '';

  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];

  let inCodeFence = false;
  let codeLang = '';
  let codeBuffer: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let blockquoteOpen = false;
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const rendered = renderInline(paragraphBuffer.map((l) => escapeHtml(l)).join('<br />'));
    html.push(`<p>${rendered}</p>`);
    paragraphBuffer = [];
  };

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const closeBlockquote = () => {
    if (blockquoteOpen) {
      html.push('</blockquote>');
      blockquoteOpen = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '    ');

    if (inCodeFence) {
      if (/^```\s*$/.test(line.trim())) {
        const codeHtml = codeBuffer.map(escapeHtml).join('\n');
        const langAttr = codeLang ? ` data-lang="${escapeHtml(codeLang)}"` : '';
        html.push(`<pre${langAttr}><code>${codeHtml}</code></pre>`);
        codeBuffer = [];
        codeLang = '';
        inCodeFence = false;
      } else {
        codeBuffer.push(line);
      }
      continue;
    }

    const fenceMatch = line.match(/^```\s*([\w-]*)\s*$/);
    if (fenceMatch) {
      flushParagraph();
      closeList();
      closeBlockquote();
      inCodeFence = true;
      codeLang = fenceMatch[1] ?? '';
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      closeBlockquote();
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      closeBlockquote();
      const level = headingMatch[1].length;
      const content = renderInline(escapeHtml(headingMatch[2]));
      html.push(`<h${level}>${content}</h${level}>`);
      continue;
    }

    const bqMatch = line.match(/^>\s?(.*)$/);
    if (bqMatch) {
      flushParagraph();
      closeList();
      if (!blockquoteOpen) {
        html.push('<blockquote>');
        blockquoteOpen = true;
      }
      const content = renderInline(escapeHtml(bqMatch[1]));
      html.push(`<p>${content}</p>`);
      continue;
    } else if (blockquoteOpen) {
      closeBlockquote();
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ulMatch || olMatch) {
      flushParagraph();
      const desired: 'ul' | 'ol' = ulMatch ? 'ul' : 'ol';
      if (listType !== desired) {
        closeList();
        html.push(`<${desired}>`);
        listType = desired;
      }
      const content = renderInline(escapeHtml((ulMatch ?? olMatch)![1]));
      html.push(`<li>${content}</li>`);
      continue;
    } else if (listType) {
      closeList();
    }

    paragraphBuffer.push(line);
  }

  if (inCodeFence) {
    const codeHtml = codeBuffer.map(escapeHtml).join('\n');
    html.push(`<pre><code>${codeHtml}</code></pre>`);
  }
  flushParagraph();
  closeList();
  closeBlockquote();

  return html.join('\n');
}

interface MarkdownPreviewProps {
  source: string;
  emptyMessage?: string;
  style?: React.CSSProperties;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ source, emptyMessage, style }) => {
  const html = useMemo(() => markdownToHtml(source ?? ''), [source]);

  if (!html) {
    return (
      <div
        style={{
          fontSize: 13,
          color: 'var(--vscode-descriptionForeground)',
          fontStyle: 'italic',
          ...style,
        }}
      >
        {emptyMessage ?? '미리볼 내용이 없습니다.'}
      </div>
    );
  }

  return (
    <div
      className="gitcat-md-preview"
      style={{
        fontSize: 13,
        lineHeight: 1.55,
        color: 'var(--vscode-foreground)',
        wordBreak: 'break-word',
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
