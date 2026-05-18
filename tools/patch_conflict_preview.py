from pathlib import Path

lines = Path('apps/webview-ui/src/components/merge/AIDraftPanel.tsx').read_text(encoding='utf-8').splitlines(True)
start = next(i for i, l in enumerate(lines) if l.strip() == '{/* 2-컬럼 diff */}')
end = next(i for i in range(start, len(lines)) if lines[i].strip() == ') : (' and 'excerpt 없음' in lines[i + 1])
block = Path('tools/conflict_preview_block.txt').read_text(encoding='utf-8')
new_lines = lines[:start] + [block] + lines[end:]
Path('apps/webview-ui/src/components/merge/AIDraftPanel.tsx').write_text(''.join(new_lines), encoding='utf-8')
print('patched', start + 1, end + 1)
