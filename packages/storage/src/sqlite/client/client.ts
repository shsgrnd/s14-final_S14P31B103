import * as fs from 'fs';
import * as path from 'path';
// @ts-expect-error: sql.js has incomplete typings for module resolution
import initSqlJs from 'sql.js';
import { SCHEMAS, SCHEMA_VERSION } from '../migrations/schema';

const DB_PATH = '.vscode/gitcat/gitcat.db';

type SqlJsStatic = {
  Database: new (data?: Uint8Array) => SqlJsRawDatabase;
};

type SqlJsRawDatabase = {
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
  export(): Uint8Array;
  prepare(sql: string): SqlJsRawStatement;
  close(): void;
};

type SqlJsRawStatement = {
  bind(values?: unknown[] | Record<string, unknown>): boolean;
  free(): boolean;
  getAsObject(): Record<string, unknown>;
  run(values?: unknown[] | Record<string, unknown>): void;
  step(): boolean;
};

export interface SQLiteRunResult {
  changes: number;
}

export interface SQLiteStatement {
  run(...params: unknown[]): SQLiteRunResult;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
}

export interface SQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SQLiteStatement;
  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult
  ): (...args: TArgs) => TResult;
  close(): void;
}

let sqlJsPromise: Promise<SqlJsStatic> | undefined;

function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs() as Promise<SqlJsStatic>;
  }

  return sqlJsPromise;
}

class SqlJsStatement implements SQLiteStatement {
  constructor(
    private readonly db: SqlJsDatabaseAdapter,
    private readonly sql: string
  ) {}

  run(...params: unknown[]): SQLiteRunResult {
    const statement = this.db.prepareRaw(this.sql);

    try {
      statement.run(params);
      this.db.persist();
      return { changes: 0 };
    } finally {
      statement.free();
    }
  }

  get(...params: unknown[]): Record<string, unknown> | undefined {
    const statement = this.db.prepareRaw(this.sql);

    try {
      statement.bind(params);
      return statement.step() ? statement.getAsObject() : undefined;
    } finally {
      statement.free();
    }
  }

  all(...params: unknown[]): Array<Record<string, unknown>> {
    const statement = this.db.prepareRaw(this.sql);
    const rows: Array<Record<string, unknown>> = [];

    try {
      statement.bind(params);

      while (statement.step()) {
        rows.push(statement.getAsObject());
      }

      return rows;
    } finally {
      statement.free();
    }
  }
}

class SqlJsDatabaseAdapter implements SQLiteDatabase {
  private transactionDepth = 0;

  constructor(
    private readonly rawDb: SqlJsRawDatabase,
    private readonly dbFilePath: string
  ) {}

  exec(sql: string): void {
    this.rawDb.exec(sql);
    this.persist();
  }

  prepare(sql: string): SQLiteStatement {
    return new SqlJsStatement(this, sql);
  }

  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult
  ): (...args: TArgs) => TResult {
    return (...args: TArgs) => {
      const isOuterTransaction = this.transactionDepth === 0;

      if (isOuterTransaction) {
        this.rawDb.exec('BEGIN');
      }

      this.transactionDepth += 1;

      try {
        const result = fn(...args);
        this.transactionDepth -= 1;

        if (isOuterTransaction) {
          this.rawDb.exec('COMMIT');
          this.persist();
        }

        return result;
      } catch (error) {
        this.transactionDepth -= 1;

        if (isOuterTransaction) {
          this.rawDb.exec('ROLLBACK');
          this.persist();
        }

        throw error;
      }
    };
  }

  close(): void {
    this.persist();
    this.rawDb.close();
  }

  prepareRaw(sql: string): SqlJsRawStatement {
    return this.rawDb.prepare(sql);
  }

  persist(): void {
    if (this.transactionDepth > 0) {
      return;
    }

    const data = this.rawDb.export();
    fs.writeFileSync(this.dbFilePath, Buffer.from(data));
  }
}

export class GitCatDatabase {
  private constructor(private readonly db: SQLiteDatabase) {}

  public static getDatabasePath(workspaceRoot: string): string {
    return path.join(workspaceRoot, DB_PATH);
  }

  public static getDatabaseDirectory(workspaceRoot: string): string {
    return path.dirname(GitCatDatabase.getDatabasePath(workspaceRoot));
  }

  public static async create(workspaceRoot: string): Promise<GitCatDatabase> {
    const dbFilePath = GitCatDatabase.getDatabasePath(workspaceRoot);
    const dbDir = GitCatDatabase.getDatabaseDirectory(workspaceRoot);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    try {
      const SQL = await loadSqlJs();
      const data = fs.existsSync(dbFilePath) ? fs.readFileSync(dbFilePath) : undefined;
      const rawDb = data ? new SQL.Database(data) : new SQL.Database();
      const database = new GitCatDatabase(new SqlJsDatabaseAdapter(rawDb, dbFilePath));

      database.initializeSchema();
      database.assertDatabaseFileCreated(dbFilePath);

      return database;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to open GitCat database at ${dbFilePath}: ${message}`);
    }
  }

  private initializeSchema(): void {
    // 현재 저장된 스키마 버전 확인
    const storedVersion = this.getStoredSchemaVersion();

    if (storedVersion !== SCHEMA_VERSION) {
      // 버전이 다르면: 모든 사용자 테이블 DROP 후 재생성
      console.log(
        `[GitCatDatabase] 스키마 버전 불일치 (저장된: ${storedVersion}, 현재: ${SCHEMA_VERSION}) → 자동 재생성`,
      );
      this.dropAllUserTables();
    }

    // 테이블 생성 (이미 있으면 무시)
    const initTransaction = this.db.transaction(() => {
      for (const query of SCHEMAS) {
        this.db.exec(query);
      }
    });
    initTransaction();

    // 버전 기록 갱신
    this.saveSchemaVersion(SCHEMA_VERSION);
  }

  /**
   * gitcat_schema_version 테이블에서 저장된 버전을 읽는다.
   * 테이블이 없거나 비어 있으면 0 반환.
   */
  private getStoredSchemaVersion(): number {
    try {
      const result = this.db
        .prepare('SELECT version FROM gitcat_schema_version LIMIT 1')
        .get();
      return typeof result?.version === 'number' ? result.version : 0;
    } catch {
      // 테이블이 아직 없으면 0 반환
      return 0;
    }
  }

  /**
   * gitcat_schema_version에 버전을 저장한다.
   */
  private saveSchemaVersion(version: number): void {
    try {
      this.db.exec('DELETE FROM gitcat_schema_version');
      this.db.prepare('INSERT INTO gitcat_schema_version (version) VALUES (?)').run(version);
    } catch (error) {
      console.error('[GitCatDatabase] 버전 저장 실패:', error);
    }
  }

  /**
   * 모든 사용자 데이터 테이블을 DROP한다.
   * FK 제약이 있으므로 의존 테이블을 먼저 제거한다.
   */
  private dropAllUserTables(): void {
    const dropOrder = [
      'restore_histories',
      'snapshot_files',
      'snapshots',
      'change_records',
      'changed_files',
      'work_sessions',
      'worktree_instances',
      'worktrees',
      'branches',
      'project_workspaces',
      'projects',
      'devices',
      'users',
      'merge_analyses',
      'conflict_candidates',
      'merge_proposals',
      'proposal_feedbacks',
      'recommendation_histories',
      'app_states',
      'app_settings',
    ];

    const dropTransaction = this.db.transaction(() => {
      for (const table of dropOrder) {
        this.db.exec(`DROP TABLE IF EXISTS ${table}`);
      }
    });
    dropTransaction();
  }

  private assertDatabaseFileCreated(dbFilePath: string): void {
    try {
      const stat = fs.statSync(dbFilePath);

      if (!stat.isFile()) {
        throw new Error('database path exists but is not a file');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`GitCat database file was not created at ${dbFilePath}: ${message}`);
    }
  }

  public getInstance(): SQLiteDatabase {
    return this.db;
  }
}
