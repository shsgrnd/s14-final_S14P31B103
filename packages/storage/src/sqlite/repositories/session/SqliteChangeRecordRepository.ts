import type {
  ChangeRecordRepository,
  ChangeRecordRow,
  CreateChangeRecordInput,
} from '@gitcat/shared-types';
import type { SQLiteDatabase } from '../../client/client';

export class SqliteChangeRecordRepository implements ChangeRecordRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async create(input: CreateChangeRecordInput): Promise<ChangeRecordRow> {
    const createdAt = input.created_at ?? new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO change_records (
        record_id,
        session_id,
        branch_name,
        description,
        created_at
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.record_id,
      input.session_id,
      input.branch_name ?? null,
      input.description ?? null,
      createdAt,
    );

    const row = await this.findById(input.record_id);
    if (!row) {
      throw new Error(`change_records row was not created: ${input.record_id}`);
    }

    return row;
  }

  async findById(recordId: string): Promise<ChangeRecordRow | null> {
    const stmt = this.db.prepare('SELECT * FROM change_records WHERE record_id = ?');
    return (stmt.get(recordId) as ChangeRecordRow | undefined) ?? null;
  }

  async listBySession(sessionId: string, limit = 100): Promise<ChangeRecordRow[]> {
    const stmt = this.db.prepare(`
      SELECT *
      FROM change_records
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(sessionId, limit) as ChangeRecordRow[];
  }

  async deleteById(recordId: string): Promise<void> {
    const deleteChangedFiles = this.db.prepare('DELETE FROM changed_files WHERE record_id = ?');
    const deleteRecord = this.db.prepare('DELETE FROM change_records WHERE record_id = ?');
    const deleteInTransaction = this.db.transaction((id: string) => {
      deleteChangedFiles.run(id);
      deleteRecord.run(id);
    });

    deleteInTransaction(recordId);
  }
}
