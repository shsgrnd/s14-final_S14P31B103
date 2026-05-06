import * as fs from 'fs';
import * as path from 'path';
import { get_encoding } from 'tiktoken';

/**
 * RAG 청크 검증 스크립트
 * 목표: 특정 디렉토리/파일의 모든 텍스트 데이터를 청킹하고 품질을 분석
 */

const encoding = get_encoding('cl100k_base');
const OUTPUT_DIR = path.resolve(__dirname, '../../../../docs/evaluation/rag-chunks');

interface ChunkResult {
    index: number;
    tokens: number;
    content: string;
    hasBrokenCode: boolean;
}

/**
 * 청킹 및 분석 함수 (600자/100자 초과시 줄바꿈)
 */
function chunkFile(fileName: string, text: string, size: number = 600, overlap: number = 100): ChunkResult[] {
    const chunks: ChunkResult[] = [];
    let start = 0;

    while (start < text.length) {
        let end = start + size;

        if (end < text.length) {
            const lastNewline = text.lastIndexOf('\n', end);
            const splitPoint = lastNewline > start ? lastNewline : end;
            end = splitPoint + 1;
        }

        const rawContent = text.substring(start, end).trim();
        // 메타데이터 주입 (파일 출처 명시)
        const contentWithMeta = `[Source: ${fileName}]\n${rawContent}`;

        chunks.push({
            index: chunks.length + 1,
            tokens: encoding.encode(contentWithMeta).length,
            content: contentWithMeta,
            hasBrokenCode: (rawContent.match(/```/g) || []).length % 2 !== 0
        });

        start = end - overlap;
        if (start < 0) start = 0;
        if (end >= text.length) break;
    }
    return chunks;
}

/**
 * 개별 파일 검증 및 리포트 생성
 */
function verifyFile(filePath: string) {
    try {
        const fileName = path.basename(filePath);
        const rawText = fs.readFileSync(filePath, 'utf-8');

        if (rawText.includes('\0')) {
            return;
        }

        const results = chunkFile(fileName, rawText);

        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }

        let report = `# Chunking Report: ${fileName}\n\n`;
        report += `- Total Chunks: ${results.length}\n`;
        report += `- Avg Tokens: ${Math.round(results.reduce((acc, cur) => acc + cur.tokens, 0) / (results.length || 1))}\n\n`;

        results.forEach(c => {
            report += `### Chunk ${c.index} (${c.tokens} tokens) ${c.hasBrokenCode ? '⚠️ BROKEN CODE BLOCK' : ''}\n`;
            report += `\`\`\`text\n${c.content}\n\`\`\`\n\n`;
        });

        const outputPath = path.join(OUTPUT_DIR, `Report_${fileName.replace(/[\.\/]/g, '_')}.md`);
        fs.writeFileSync(outputPath, report);
    } catch (error: any) {
        console.error(`❌ 파일 처리 오류 (${filePath}): ${error.message}`);
    }
}

/**
 * 실행 메인 로직
 */
function run() {
    // 인자로 경로를 받거나 기본 docs 폴더 사용
    const targetArg = process.argv[2] || '../../../../docs';
    const targetPath = path.resolve(__dirname, targetArg);

    if (!fs.existsSync(targetPath)) {
        console.error(`❌ 경로를 찾을 수 없습니다: ${targetPath}`);
        return;
    }

    const stats = fs.statSync(targetPath);

    if (stats.isDirectory()) {
        const entries = fs.readdirSync(targetPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isFile() && !entry.name.startsWith('.')) {
                verifyFile(path.join(targetPath, entry.name));
            }
        }
    } else {
        verifyFile(targetPath);
    }

    encoding.free();
}

run();
