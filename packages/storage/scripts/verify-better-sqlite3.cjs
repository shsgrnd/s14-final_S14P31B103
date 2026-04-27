const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

function removeDirectorySafe(targetDir) {
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitcat-sqlite-'));
const dbPath = path.join(tempRoot, 'runtime-check.db');

try {
  console.log('[verify:sqlite] better-sqlite3 모듈 로드 시작');

  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_check (
      id INTEGER PRIMARY KEY,
      label TEXT NOT NULL
    );
  `);

  const insert = db.prepare('INSERT INTO runtime_check (label) VALUES (?)');
  insert.run('ok');

  const row = db.prepare('SELECT COUNT(*) AS count FROM runtime_check').get();
  db.close();

  console.log(`[verify:sqlite] DB 파일 생성 확인: ${dbPath}`);
  console.log(`[verify:sqlite] 간단 쿼리 실행 결과: count=${row.count}`);
  console.log('[verify:sqlite] better-sqlite3 런타임 검증 성공');
} catch (error) {
  console.error('[verify:sqlite] better-sqlite3 런타임 검증 실패');
  console.error(error);
  process.exitCode = 1;
} finally {
  removeDirectorySafe(tempRoot);
}
