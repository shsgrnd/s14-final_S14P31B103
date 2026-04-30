import * as fs from 'fs';
import * as path from 'path';
import { SCHEMAS } from '../migrations/schema';

const initSqlJs = require('sql.js/dist/sql-asm.js');

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
    sqlJsPromise = initSqlJs();
  }

  return sqlJsPromise as Promise<SqlJsStatic>;
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
    const initTransaction = this.db.transaction(() => {
      for (const query of SCHEMAS) {
        this.db.exec(query);
      }
    });

    initTransaction();
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
