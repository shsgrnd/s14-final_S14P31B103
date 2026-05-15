import type { SafetyWarning, SnapshotManifest } from '@gitcat/shared-types';

export function getManifestSafetyWarnings(
  manifest: SnapshotManifest,
): SafetyWarning[] | undefined {
  return manifest.safetyWarnings ?? manifest.warnings;
}

export function serializeSafetyWarnings(
  warnings: SafetyWarning[] | undefined,
): string | null {
  if (!warnings || warnings.length === 0) {
    return null;
  }

  return JSON.stringify(warnings);
}

export function deserializeSafetyWarnings(
  raw: string | null | undefined,
): SafetyWarning[] | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as SafetyWarning[];
    return parsed.length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}
