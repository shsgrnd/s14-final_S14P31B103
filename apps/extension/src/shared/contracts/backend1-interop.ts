import type { RepositoryBundle } from '../../storage/repositories/interfaces';
import type { SettingsAndSecretsBundle } from '../../platform/settings/contracts';
import type { Backend2ServiceBundle } from './backend2-contracts';

/**
 * backend1이 소비하는 backend2 연동 계약입니다.
 *
 * 팀 분업 중 경계가 흐려지지 않도록
 * repositories / settings / services 전달 형태를 명시적으로 고정합니다.
 */
export interface Backend1ConsumeContracts {
  repositories: RepositoryBundle;
  settingsAndSecrets: SettingsAndSecretsBundle;
  services: Backend2ServiceBundle;
}
