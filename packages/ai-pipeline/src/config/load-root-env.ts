import fs from 'fs';
import path from 'path';

let envLoaded = false;

function findEnvFile(startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    const candidate = path.join(currentDir, '.env');
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function parseEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/**
 * 모노레포 루트의 `.env`를 한 번만 읽어 process.env에 병합합니다.
 * 이미 셸에서 주입한 값은 덮어쓰지 않아서 시연/CI 양쪽에 안전합니다.
 */
export function loadRootEnv(): void {
  if (envLoaded) {
    return;
  }

  const envPath = findEnvFile(__dirname);
  if (!envPath) {
    envLoaded = true;
    return;
  }

  const file = fs.readFileSync(envPath, 'utf8');
  for (const line of file.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const rawValue = trimmed.slice(separatorIndex + 1);
    process.env[key] = parseEnvValue(rawValue);
  }

  envLoaded = true;
}
