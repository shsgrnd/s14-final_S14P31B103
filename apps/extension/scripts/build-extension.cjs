const path = require('path');
const fs = require('fs');

const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '..', '..');

function resolveEsbuild() {
  const searchPaths = [
    extensionRoot,
    repoRoot,
    path.join(repoRoot, 'node_modules'),
    path.join(repoRoot, 'node_modules', '.pnpm', 'node_modules'),
  ];

  for (const searchPath of searchPaths) {
    try {
      return require(require.resolve('esbuild', { paths: [searchPath] }));
    } catch (error) {
      // Try the next candidate path.
    }
  }

  throw new Error(
    'esbuild를 찾지 못했습니다. workspace 의존성이 설치되어 있는지 확인해 주세요.'
  );
}

async function run() {
  const esbuild = resolveEsbuild();
  const watchMode = process.argv.includes('--watch');
  const outdir = path.join(extensionRoot, 'dist');

  if (!watchMode) {
    fs.rmSync(outdir, { recursive: true, force: true });
  }
  fs.mkdirSync(outdir, { recursive: true });

  const options = {
    entryPoints: [path.join(extensionRoot, 'src', 'extension.ts')],
    outfile: path.join(outdir, 'extension.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    sourcemap: false,
    logLevel: 'info',
    external: [
      'vscode',
      '@gitcat/ai-pipeline',
      '@gitcat/ai-pipeline/extension',
      '@gitcat/git-client-cli',
      '@gitcat/git-core',
      '@gitcat/shared-types',
      '@gitcat/storage',
    ],
  };

  if (watchMode) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[build-extension] watching for changes...');
    return;
  }

  await esbuild.build(options);
}

run().catch((error) => {
  console.error('[build-extension] failed:', error);
  process.exit(1);
});
