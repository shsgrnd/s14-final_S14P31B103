import type {
  CreateSnapshotFileInput,
  SnapshotFileRepository,
  SnapshotFileRow,
} from '@gitcat/shared-types';
import type { SQLiteDatabase } from '../../client/client';

export class SqliteSnapshotFileRepository implements SnapshotFileRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async createMany(files: CreateSnapshotFileInput[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO snapshot_files (
        snapshot_file_id,
        snapshot_id,
        original_path,
        stored_path,
        file_name,
        content_hash,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: CreateSnapshotFileInput[]) => {
      for (const item of items) {
        stmt.run(
          item.snapshot_file_id,
          item.snapshot_id,
          item.original_path,
          item.stored_path,
          item.file_name,
          item.content_hash ?? null,
          item.created_at ?? now,
        );
      }
    });

    insertMany(files);
  }

  async listBySnapshotId(snapshotId: string): Promise<SnapshotFileRow[]> {
    const stmt = this.db.prepare(`
      SELECT *
      FROM snapshot_files
      WHERE snapshot_id = ?
      ORDER BY original_path ASC
    `);

    return stmt.all(snapshotId) as SnapshotFileRow[];
  }

  async findById(snapshotFileId: string): Promise<SnapshotFileRow | null> {
    const stmt = this.db.prepare('SELECT * FROM snapshot_files WHERE snapshot_file_id = ?');
    return (stmt.get(snapshotFileId) as SnapshotFileRow | undefined) ?? null;
  }

  async deleteById(snapshotFileId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM snapshot_files WHERE snapshot_file_id = ?');
    stmt.run(snapshotFileId);
  }

  async deleteBySnapshotId(snapshotId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM snapshot_files WHERE snapshot_id = ?');
    stmt.run(snapshotId);
  }
}
