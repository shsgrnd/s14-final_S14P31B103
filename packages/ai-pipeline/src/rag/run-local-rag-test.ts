import * as fs from 'fs';
import * as path from 'path';
import { LocalEmbedder, LocalVectorStore, LocalDocument } from './index';

const SUPPORTED_EXTENSIONS = new Set(['.md', '.json', '.ts', '.py', '.txt', '.patch']);
const MAX_CHUNK_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;
const MAX_SCAN_DEPTH = 6;
const MAX_FILE_COUNT = 500;
const MAX_FILE_SIZE_BYTES = 1024 * 1024;

interface ScanStats {
  skippedByDepth: number;
  skippedByExtension: number;
  skippedByFileSize: number;
  skippedSymlink: number;
}

function splitIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = start + MAX_CHUNK_CHARS;
    chunks.push(text.substring(start, end));
    start = end - CHUNK_OVERLAP_CHARS;
  }
  return chunks;
}

function getFilesRecursively(
  dir: string,
  rootDir: string,
  stats: ScanStats,
): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);

    // 테스트 스크립트가 예기치 않게 워크스페이스 밖 심볼릭 링크를 타지 않도록
    // lstat 기준으로 링크를 먼저 걸러냅니다.
    const linkStat = fs.lstatSync(filePath);
    if (linkStat.isSymbolicLink()) {
      stats.skippedSymlink += 1;
      return;
    }

    const stat = fs.statSync(filePath);
    const relativePath = path.relative(rootDir, filePath);
    const depth = relativePath.split(path.sep).length - 1;

    if (stat && stat.isDirectory()) {
      if (depth >= MAX_SCAN_DEPTH) {
        stats.skippedByDepth += 1;
        return;
      }
      results = results.concat(getFilesRecursively(filePath, rootDir, stats));
    } else {
      if (!SUPPORTED_EXTENSIONS.has(path.extname(filePath))) {
        stats.skippedByExtension += 1;
        return;
      }

      if (stat.size > MAX_FILE_SIZE_BYTES) {
        stats.skippedByFileSize += 1;
        return;
      }

      results.push(filePath);
    }
  });
  return results;
}

async function main() {
  console.log("🚀 시작: Local RAG (In-memory MVP) 테스트");
  
  const rootDir = path.resolve(__dirname, '../../../../synthetic_dataset');
  if (!fs.existsSync(rootDir)) {
    console.error("데이터셋 폴더를 찾을 수 없습니다:", rootDir);
    return;
  }

  const scanStats: ScanStats = {
    skippedByDepth: 0,
    skippedByExtension: 0,
    skippedByFileSize: 0,
    skippedSymlink: 0,
  };

  const files = getFilesRecursively(rootDir, rootDir, scanStats).slice(0, MAX_FILE_COUNT);
  const docs: LocalDocument[] = [];

  if (files.length === MAX_FILE_COUNT) {
    console.warn(`[WARN] 파일 수가 많아 상위 ${MAX_FILE_COUNT}개만 사용합니다.`);
  }

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf-8');
    if (!text.trim()) continue;
    
    const chunks = splitIntoChunks(text);
    const relativePath = path.relative(rootDir, file).replace(/\\/g, '/');

    chunks.forEach((chunk, idx) => {
      docs.push({
        id: `${relativePath}__chunk${idx}`,
        content: chunk,
        metadata: {
          source_file: relativePath,
          chunk_index: idx
        }
      });
    });
  }

  console.log(`[INFO] 총 ${docs.length}개의 청크 로드 완료`);
  console.log(
    `[INFO] 스캔 제외 통계 depth=${scanStats.skippedByDepth}, ` +
      `extension=${scanStats.skippedByExtension}, ` +
      `file_size=${scanStats.skippedByFileSize}, symlink=${scanStats.skippedSymlink}`,
  );

  const vectorStore = new LocalVectorStore();
  console.log("[INFO] 벡터 임베딩 진행 중... (시간이 조금 걸릴 수 있습니다)");

  // 임베딩 (순차 처리)
  for (let i = 0; i < docs.length; i++) {
    await vectorStore.addDocument(docs[i]);
    if ((i + 1) % 10 === 0) {
      console.log(`[INFO] 임베딩 진행: ${i + 1}/${docs.length}`);
    }
  }

  console.log("[INFO] 임베딩 완료!");

  const TEST_QUERIES = [
    "TypeScript interface type mismatch merge conflict",
    "SQLite repository artifact ref 저장 충돌",
    "export field policy jsonl SFT training",
    "LoRA adapter training candidate chosen rejected",
    "multi-file merge conflict resolution",
  ];

  const allResults: Record<string, any[]> = {};

  for (const query of TEST_QUERIES) {
    console.log(`\n[쿼리] ${query}`);
    const results = await vectorStore.search(query, 3);
    
    results.forEach((r, i) => {
      console.log(`  [${i + 1}] score=${r.score.toFixed(4)} | ${r.document.metadata?.source_file}`);
    });

    allResults[query] = results.map(r => ({
      source: r.document.metadata?.source_file,
      score: r.score
    }));
  }

  const outputPath = path.resolve(__dirname, 'local_rag_test_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2), 'utf-8');
  console.log(`\n📁 결과 저장: ${outputPath}`);
}

main().catch(console.error);
