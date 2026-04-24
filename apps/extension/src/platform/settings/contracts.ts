import type {
  AppSettings,
  SecretsStore,
  SettingsStore,
} from '../../../../../packages/shared-types/src/contracts/services';

/**
 * VS Code globalState를 감싸는 어댑터 계약입니다.
 *
 * 도메인/서비스 계층이 VS Code API 타입을 직접 알지 않도록
 * 최소 기능(get/update)만 노출합니다.
 */
export interface GlobalStateAdapter {
  get<T>(key: string): T | undefined;
  update<T>(key: string, value: T | undefined): Promise<void>;
}

/**
 * VS Code SecretStorage를 감싸는 어댑터 계약입니다.
 */
export interface VscodeSecretsAdapter {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Settings 서비스 구성 옵션입니다.
 */
export interface SettingsServiceOptions {
  defaultSettings: AppSettings;
  settingsPrefix?: string;
}

/**
 * 설정 저장소 + 시크릿 저장소를 함께 전달하기 위한 번들 타입입니다.
 */
export interface SettingsAndSecretsBundle {
  settingsStore: SettingsStore;
  secretsStore: SecretsStore;
}
