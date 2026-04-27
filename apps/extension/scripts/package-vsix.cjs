const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const extensionRoot = path.resolve(__dirname, '..');
const artifactsDir = path.join(extensionRoot, '.artifacts');
const packageJson = require(path.join(extensionRoot, 'package.json'));
const outputPath = path.join(artifactsDir, `gitcat-${packageJson.version}.vsix`);

fs.mkdirSync(artifactsDir, { recursive: true });

// `vsce package`는 내부적으로 `vscode:prepublish` 스크립트를 실행하므로
// 팀원은 이 명령 하나로 compile + vsix 패키징까지 확인할 수 있습니다.
const result = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['dlx', '@vscode/vsce', 'package', '--out', outputPath],
  {
    cwd: extensionRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
);

if (result.error) {
  console.error('[package:vsix] 패키징 명령 실행 자체에 실패했습니다.');
  console.error(result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[package:vsix] vsce 패키징이 실패했습니다. exitCode=${result.status}`);
  process.exit(result.status ?? 1);
}

console.log(`[package:vsix] VSIX 생성 완료: ${outputPath}`);
