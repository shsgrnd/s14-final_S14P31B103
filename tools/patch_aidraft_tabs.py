from pathlib import Path

lines = Path('apps/webview-ui/src/components/merge/AIDraftPanel.tsx').read_text(encoding='utf-8').splitlines(True)
start = next(i for i, l in enumerate(lines) if '3-column code view' in l)
end = next(i for i, l in enumerate(lines) if i > 750 and l == '      </div>\n')
col3_start = next(i for i in range(start, end) if 'Column 3' in lines[i])
col3 = ''.join(lines[col3_start:end])

block = """      <ViewTabBar
        tabs={[
          { id: 'compare', label: '2열 비교 (상대·내)' },
          { id: 'draft', label: 'AI 병합 초안' },
        ]}
        active={draftTab}
        onChange={(id) => setDraftTab(id as 'compare' | 'draft')}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {draftTab === 'compare' ? (
          <motion.div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
"""

# Fix accidental motion in block - use div only
block = block.replace("<motion.div", "<div").replace("</motion.div>", "</div>")

block += """            <DiffColumn
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
"""

closing = "        )}\n      </div>\n"

new_lines = lines[:start] + [block] + [col3] + [closing] + lines[end + 1:]
Path('apps/webview-ui/src/components/merge/AIDraftPanel.tsx').write_text(''.join(new_lines), encoding='utf-8')
print(f'replaced lines {start + 1}-{end + 1}')
