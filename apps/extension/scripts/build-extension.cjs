const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '..', '..');

function resolveModule(moduleId) {
  const searchPaths = [
    extensionRoot,
    repoRoot,
    path.join(repoRoot, 'node_modules'),
    path.join(repoRoot, 'node_modules', '.pnpm', 'node_modules'),
  ];

  for (const searchPath of searchPaths) {
    try {
      return require.resolve(moduleId, { paths: [searchPath] });
    } catch (error) {
      // Try the next candidate path.
    }
  }

  throw new Error(`Could not resolve module "${moduleId}" for the extension build.`);
}

function resolveEsbuild() {
  return require(resolveModule('esbuild'));
}

function shouldFallbackToTsc(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Access is denied') || message.includes('Could not resolve');
}

function runTscFallback(watchMode) {
  const tscCliPath = resolveModule('typescript/bin/tsc');
  const args = [tscCliPath, '-p', extensionRoot];

  if (watchMode) {
    args.push('--watch', '--preserveWatchOutput');
  }

  const result = spawnSync(process.execPath, args, {
    cwd: extensionRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`TypeScript fallback build failed with exit code ${result.status}.`);
  }
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
    try {
      const ctx = await esbuild.context(options);
      await ctx.watch();
      console.log('[build-extension] watching for changes...');
      return;
    } catch (error) {
      if (!shouldFallbackToTsc(error)) {
        throw error;
      }

      console.warn('[build-extension] esbuild watch failed, falling back to tsc watch:', error);
      runTscFallback(true);
      return;
    }
  }

  try {
    await esbuild.build(options);
  } catch (error) {
    if (!shouldFallbackToTsc(error)) {
      throw error;
    }

    console.warn('[build-extension] esbuild failed, falling back to tsc emit:', error);
    runTscFallback(false);
  }
}

run().catch((error) => {
  console.error('[build-extension] failed:', error);
  process.exit(1);
});
