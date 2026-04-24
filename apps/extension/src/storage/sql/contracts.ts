/**
 * 단일 마이그레이션 단위입니다.
 *
 * version은 오름차순 적용 기준이며,
 * name은 로그/진단에서 어떤 변경인지 식별하는 용도입니다.
 */
export interface SqlMigration {
  version: number;
  name: string;
  sql: string;
}

/**
 * SQLite 스키마 부트스트랩 계약입니다.
 *
 * getMigrations로 적용 목록을 제공하고,
 * migrate에서 현재 DB 버전에 맞춰 누락 마이그레이션을 반영합니다.
 */
export interface SqliteSchemaBootstrapper {
  getMigrations(): SqlMigration[];
  migrate(): Promise<void>;
}
