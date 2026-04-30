const fs = require('fs');
const os = require('os');
const path = require('path');
const initSqlJs = require('sql.js/dist/sql-asm.js');

function removeDirectorySafe(targetDir) {
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitcat-sqlite-'));
  const dbPath = path.join(tempRoot, 'runtime-check.db');

  try {
    console.log('[verify:sqlite] sql.js runtime load start');

    const SQL = await initSqlJs();
    const db = new SQL.Database();

    db.run(`
      CREATE TABLE IF NOT EXISTS runtime_check (
        id INTEGER PRIMARY KEY,
        label TEXT NOT NULL
      );
    `);

    db.run('INSERT INTO runtime_check (label) VALUES (?)', ['ok']);

    const row = db.exec('SELECT COUNT(*) AS count FROM runtime_check')[0];
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    db.close();

    console.log(`[verify:sqlite] DB file created: ${dbPath}`);
    console.log(`[verify:sqlite] query result: count=${row.values[0][0]}`);
    console.log('[verify:sqlite] sql.js runtime verification succeeded');
  } catch (error) {
    console.error('[verify:sqlite] sql.js runtime verification failed');
    console.error(error);
    process.exitCode = 1;
  } finally {
    removeDirectorySafe(tempRoot);
  }
}

main();
