export type SupportedExtensionAiMode = 'live-local' | 'live-remote';

export interface NormalizedExtensionAiMode {
  rawMode: string | undefined;
  mode: SupportedExtensionAiMode;
  warningMessage?: string;
}

export const LEGACY_MOCK_MODE_WARNING =
  'GitCat AI 설정의 `mock` 모드는 개발 전용으로 변경되었습니다. 현재는 `live-local`로 자동 전환되며, 앞으로는 `Gitcat > Ai: Mode`를 `live-local` 또는 `live-remote`로 설정해 주세요.';

export const LEGACY_AI_MODE_MIGRATION_NOTICE =
  '기존 GitCat AI 모드 설정을 기본값인 `live-local`로 자동 전환했습니다. 원격 추론이 필요하면 `Gitcat > Ai: Mode`에서 `live-remote`를 다시 선택해 주세요.';

export function shouldMigrateStoredAiMode(rawMode: string | undefined): boolean {
  const trimmedMode = rawMode?.trim();
  return trimmedMode === 'mock' || trimmedMode === 'live' || trimmedMode === 'live-remote';
}

export function normalizeExtensionAiMode(rawMode: string | undefined): NormalizedExtensionAiMode {
  const trimmedMode = rawMode?.trim();

  switch (trimmedMode) {
    case 'live-remote':
      return { rawMode: trimmedMode, mode: 'live-remote' };
    case 'live':
      return { rawMode: trimmedMode, mode: 'live-remote' };
    case 'mock':
      return {
        rawMode: trimmedMode,
        mode: 'live-local',
        warningMessage: LEGACY_MOCK_MODE_WARNING,
      };
    case 'live-local':
    default:
      return { rawMode: trimmedMode, mode: 'live-local' };
  }
}
