import assert from 'node:assert/strict';
import { GitCatLlamaClient } from './LlamaClient';

function getResolvedModelPath(modelPath: string): string {
  return (new GitCatLlamaClient({ modelPath }) as any).modelPath;
}

function testWindowsPathIsConvertedInWsl(): void {
  const originalDistro = process.env.WSL_DISTRO_NAME;
  const originalInterop = process.env.WSL_INTEROP;
  process.env.WSL_DISTRO_NAME = 'Ubuntu';
  delete process.env.WSL_INTEROP;

  try {
    const resolved = getResolvedModelPath('C:\\Users\\SSAFY\\models\\gitcat-v3-sft-merged-Q4_K_M.gguf');
    assert.equal(resolved, '/mnt/c/Users/SSAFY/models/gitcat-v3-sft-merged-Q4_K_M.gguf');
  } finally {
    if (originalDistro === undefined) {
      delete process.env.WSL_DISTRO_NAME;
    } else {
      process.env.WSL_DISTRO_NAME = originalDistro;
    }

    if (originalInterop === undefined) {
      delete process.env.WSL_INTEROP;
    } else {
      process.env.WSL_INTEROP = originalInterop;
    }
  }
}

function testPathIsTrimmed(): void {
  const originalDistro = process.env.WSL_DISTRO_NAME;
  const originalInterop = process.env.WSL_INTEROP;
  delete process.env.WSL_DISTRO_NAME;
  delete process.env.WSL_INTEROP;

  try {
    const resolved = getResolvedModelPath('  /tmp/model.gguf  ');
    assert.equal(resolved, '/tmp/model.gguf');
  } finally {
    if (originalDistro === undefined) {
      delete process.env.WSL_DISTRO_NAME;
    } else {
      process.env.WSL_DISTRO_NAME = originalDistro;
    }

    if (originalInterop === undefined) {
      delete process.env.WSL_INTEROP;
    } else {
      process.env.WSL_INTEROP = originalInterop;
    }
  }
}

function run(): void {
  testWindowsPathIsConvertedInWsl();
  testPathIsTrimmed();
  console.log('LlamaClient.path tests passed');
}

run();
