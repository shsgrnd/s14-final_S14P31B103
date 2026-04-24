import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { SCHEMAS } from '../migrations/schema';

/**
 * GitCat 전용 로컬 SQLite 데이터베이스 파일 경로
 */
const DB_PATH = '.vscode/gitcat/gitcat.db';

/**
 * GitCat의 로컬 메타데이터(SQLite)를 제어하는 클라이언트 클래스입니다.
 * 
 * [주의사항]
 * 백엔드/AI 파트 개발자 분들은 이 클래스의 인스턴스를 생성하여
 * `getInstance()`를 통해 DB 객체를 받아 직접 쿼리를 수행하시면 됩니다.
 * 테이블은 최초 생성 시 자동으로 초기화됩니다.
 */
export class GitCatDatabase {
  private db: Database.Database;

  /**
   * @param workspaceRoot 사용자의 현재 VS Code 워크스페이스 루트 경로
   */
  constructor(workspaceRoot: string) {
    const dbFilePath = path.join(workspaceRoot, DB_PATH);
    const dbDir = path.dirname(dbFilePath);
    
    // DB 파일을 담을 .vscode/gitcat 폴더가 존재하지 않으면 먼저 생성합니다.
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // SQLite DB 연결 (지정된 경로에 db 파일이 없으면 자동으로 빈 db 파일이 생성됨)
    this.db = new Database(dbFilePath);
    
    // DB 연결 직후, 누락된 테이블이 없는지 확인하고 스키마를 초기화합니다.
    this.initializeSchema();
  }

  /**
   * schema.ts에 정의된 15개의 릴레이션 테이블을 생성합니다.
   * 이미 존재하는 테이블은 `IF NOT EXISTS` 구문으로 인해 건너뜁니다.
   * 안전하고 빠른 일괄 처리를 위해 트랜잭션(transaction)을 사용합니다.
   */
  private initializeSchema() {
    const initTransaction = this.db.transaction(() => {
      for (const query of SCHEMAS) {
        this.db.exec(query);
      }
    });

    initTransaction();
  }

  /**
   * 쿼리를 수행할 수 있는 better-sqlite3 DB 인스턴스를 반환합니다.
   * 
   * @example
   * const db = new GitCatDatabase(root).getInstance();
   * const sessions = db.prepare('SELECT * FROM Session').all();
   */
  public getInstance(): Database.Database {
    return this.db;
  }
}
