import type {
  ChangedFileRepository,
  ChangedFileRow,
  CreateChangedFileInput,
} from '@gitcat/shared-types';
import type { SQLiteDatabase } from '../../client/client';

export class SqliteChangedFileRepository implements ChangedFileRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async createMany(files: CreateChangedFileInput[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO changed_files (
        changed_file_id,
        record_id,
        file_path,
        change_type,
        location,
        summary,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: CreateChangedFileInput[]) => {
      for (const item of items) {
        stmt.run(
          item.changed_file_id,
          item.record_id,
          item.file_path,
          item.change_type,
          item.location ?? null,
          item.summary ?? null,
          item.created_at ?? now,
        );
      }
    });

    insertMany(files);
  }

  async listByRecordId(recordId: string): Promise<ChangedFileRow[]> {
    const stmt = this.db.prepare(`
      SELECT *
      FROM changed_files
      WHERE record_id = ?
      ORDER BY file_path ASC
    `);

    return stmt.all(recordId) as ChangedFileRow[];
  }

  async findById(changedFileId: string): Promise<ChangedFileRow | null> {
    const stmt = this.db.prepare('SELECT * FROM changed_files WHERE changed_file_id = ?');
    return (stmt.get(changedFileId) as ChangedFileRow | undefined) ?? null;
  }

  async deleteById(changedFileId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM changed_files WHERE changed_file_id = ?');
    stmt.run(changedFileId);
  }

  async deleteByRecordId(recordId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM changed_files WHERE record_id = ?');
    stmt.run(recordId);
  }
}
