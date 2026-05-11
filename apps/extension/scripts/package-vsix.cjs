const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '..', '..');
const packagesRoot = path.join(repoRoot, 'packages');
const webviewUiRoot = path.join(repoRoot, 'apps', 'webview-ui');
const artifactsDir = path.join(extensionRoot, '.artifacts');
const stagingDir = path.join(artifactsDir, 'vsce-staging');
const extensionPackageJson = require(path.join(extensionRoot, 'package.json'));
const outputPath = path.join(artifactsDir, `gitcat-${extensionPackageJson.version}.vsix`);

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(`[package:vsix] 명령 실행에 실패했습니다: ${command} ${args.join(' ')}`);
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[package:vsix] 명령이 실패했습니다. exitCode=${result.status}`);
    process.exit(result.status ?? 1);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDirectory(sourceDir, targetDir, filter) {
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    dereference: true,
    force: true,
    filter,
  });
}

function copyIfExists(relativePath) {
  const sourcePath = path.join(extensionRoot, relativePath);
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const targetPath = path.join(stagingDir, relativePath);
  const sourceStat = fs.statSync(sourcePath);
  if (sourceStat.isDirectory()) {
    copyDirectory(sourcePath, targetPath);
    return;
  }

  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function copyAbsolutePathIfExists(sourcePath, targetRelativePath) {
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const targetPath = path.join(stagingDir, targetRelativePath);
  const sourceStat = fs.statSync(sourcePath);
  if (sourceStat.isDirectory()) {
    copyDirectory(sourcePath, targetPath);
    return;
  }

  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function nodeModulesPackagePath(nodeModulesRoot, packageName) {
  const parts = packageName.split('/');
  return path.join(nodeModulesRoot, ...parts);
}

function packageNodeModulesRoot(packageDir, packageName) {
  if (packageName.startsWith('@')) {
    return path.dirname(path.dirname(packageDir));
  }

  return path.dirname(packageDir);
}

function loadWorkspacePackages() {
  const workspacePackages = new Map();
  const entries = fs.readdirSync(packagesRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageDir = path.join(packagesRoot, entry.name);
    const packageJsonPath = path.join(packageDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    workspacePackages.set(manifest.name, {
      dir: packageDir,
      manifest,
    });
  }

  return workspacePackages;
}

function rewriteWorkspaceSpecs(manifest, workspacePackages) {
  const rewritten = JSON.parse(JSON.stringify(manifest));
  const dependencyFields = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ];

  for (const field of dependencyFields) {
    const dependencies = rewritten[field];
    if (!dependencies) {
      continue;
    }

    for (const [dependencyName, spec] of Object.entries(dependencies)) {
      if (!String(spec).startsWith('workspace:')) {
        continue;
      }

      const workspacePackage = workspacePackages.get(dependencyName);
      if (!workspacePackage) {
        throw new Error(`workspace 패키지 버전을 찾을 수 없습니다: ${dependencyName}`);
      }

      dependencies[dependencyName] = workspacePackage.manifest.version;
    }
  }

  return rewritten;
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function copyWorkspacePackageContents(sourceDir, targetDir) {
  ensureDir(targetDir);

  const distSourceDir = path.join(sourceDir, 'dist');
  const distTargetDir = path.join(targetDir, 'dist');
  if (!fs.existsSync(distSourceDir)) {
    throw new Error(`workspace 패키지 dist 디렉터리를 찾을 수 없습니다: ${distSourceDir}`);
  }

  copyDirectory(distSourceDir, distTargetDir, (currentSourcePath) => {
    const basename = path.basename(currentSourcePath);

    if (basename.endsWith('.map') || basename.endsWith('.d.ts')) {
      return false;
    }

    return true;
  });

  for (const filename of ['README.md', 'LICENSE', 'LICENSE.txt']) {
    const sourcePath = path.join(sourceDir, filename);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    fs.copyFileSync(sourcePath, path.join(targetDir, filename));
  }
}

function transformWorkspaceManifestForPackaging(manifest) {
  const transformed = JSON.parse(JSON.stringify(manifest));

  if (transformed.name === '@gitcat/ai-pipeline') {
    delete transformed.dependencies?.['@xenova/transformers'];
    delete transformed.optionalDependencies?.['onnxruntime-node'];
  }

  return transformed;
}

function shouldIncludeInstalledDependencyPath(packageRoot, currentSourcePath) {
  const relativePath = path.relative(packageRoot, currentSourcePath);
  if (!relativePath) {
    return true;
  }

  const segments = relativePath.split(path.sep);
  const topLevelName = segments[0];
  const basename = path.basename(currentSourcePath);
  const excludedTopLevelNames = new Set([
    'test',
    'tests',
    '__tests__',
    'docs',
    'doc',
    'example',
    'examples',
    'coverage',
    '.github',
    '.husky',
  ]);

  if (excludedTopLevelNames.has(topLevelName)) {
    return false;
  }

  if (
    basename.endsWith('.map') ||
    basename === 'tsconfig.json' ||
    basename === 'tsconfig.build.json'
  ) {
    return false;
  }

  return true;
}

function stageInstalledDependency(sourcePackagePath, targetConsumerDir, stagedKeys) {
  const sourceRealPath = fs.realpathSync(sourcePackagePath);
  const sourceManifestPath = path.join(sourceRealPath, 'package.json');
  if (!fs.existsSync(sourceManifestPath)) {
    throw new Error(`의존성 package.json을 찾을 수 없습니다: ${sourceRealPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
  const targetDependencyDir = nodeModulesPackagePath(
    path.join(targetConsumerDir, 'node_modules'),
    manifest.name
  );
  const stagedKey = `${targetDependencyDir}::${sourceRealPath}`;

  if (stagedKeys.has(stagedKey)) {
    return;
  }
  stagedKeys.add(stagedKey);

  ensureDir(path.dirname(targetDependencyDir));
  copyDirectory(sourceRealPath, targetDependencyDir, (currentSourcePath) =>
    shouldIncludeInstalledDependencyPath(sourceRealPath, currentSourcePath)
  );

  const dependencyNames = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
  const sourceParentNodeModules = packageNodeModulesRoot(sourceRealPath, manifest.name);

  for (const dependencyName of dependencyNames) {
    const nestedSourcePath = nodeModulesPackagePath(sourceParentNodeModules, dependencyName);
    if (!fs.existsSync(nestedSourcePath)) {
      continue;
    }

    stageInstalledDependency(nestedSourcePath, targetDependencyDir, stagedKeys);
  }
}

function stageWorkspacePackage(packageName, workspacePackages, stagedWorkspacePackages, stagedDependencyKeys) {
  if (stagedWorkspacePackages.has(packageName)) {
    return;
  }

  const workspacePackage = workspacePackages.get(packageName);
  if (!workspacePackage) {
    throw new Error(`알 수 없는 workspace 패키지입니다: ${packageName}`);
  }

  stagedWorkspacePackages.add(packageName);

  const targetDir = nodeModulesPackagePath(path.join(stagingDir, 'node_modules'), packageName);
  ensureDir(path.dirname(targetDir));
  copyWorkspacePackageContents(workspacePackage.dir, targetDir);

  const packagingManifest = transformWorkspaceManifestForPackaging(workspacePackage.manifest);
  const rewrittenManifest = rewriteWorkspaceSpecs(packagingManifest, workspacePackages);
  writeJson(path.join(targetDir, 'package.json'), rewrittenManifest);

  const dependencyNames = new Set([
    ...Object.keys(packagingManifest.dependencies ?? {}),
    ...Object.keys(packagingManifest.optionalDependencies ?? {}),
  ]);

  for (const dependencyName of dependencyNames) {
    if (workspacePackages.has(dependencyName)) {
      stageWorkspacePackage(
        dependencyName,
        workspacePackages,
        stagedWorkspacePackages,
        stagedDependencyKeys
      );
      continue;
    }

    const sourceDependencyPath = nodeModulesPackagePath(
      path.join(workspacePackage.dir, 'node_modules'),
      dependencyName
    );
    if (!fs.existsSync(sourceDependencyPath)) {
      throw new Error(
        `workspace 패키지 의존성을 찾을 수 없습니다: ${packageName} -> ${dependencyName}`
      );
    }

    stageInstalledDependency(sourceDependencyPath, targetDir, stagedDependencyKeys);
  }
}

function buildWorkspacePackage(packageName, workspacePackages, builtWorkspacePackages) {
  if (builtWorkspacePackages.has(packageName)) {
    return;
  }

  const workspacePackage = workspacePackages.get(packageName);
  if (!workspacePackage) {
    throw new Error(`알 수 없는 workspace 패키지입니다: ${packageName}`);
  }

  for (const dependencyName of Object.keys(workspacePackage.manifest.dependencies ?? {})) {
    if (!workspacePackages.has(dependencyName)) {
      continue;
    }

    buildWorkspacePackage(dependencyName, workspacePackages, builtWorkspacePackages);
  }

  if (workspacePackage.manifest.scripts?.build) {
    runCommand(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['run', 'build'],
      workspacePackage.dir
    );
  }

  builtWorkspacePackages.add(packageName);
}

function stageExtensionPackage(workspacePackages) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
  ensureDir(stagingDir);

  const stagedManifest = rewriteWorkspaceSpecs(extensionPackageJson, workspacePackages);
  delete stagedManifest.devDependencies;
  stagedManifest.scripts = {
    package: 'echo "packaged from staging"',
  };

  writeJson(path.join(stagingDir, 'package.json'), stagedManifest);

  copyIfExists('dist');
  copyIfExists('media');
  copyIfExists('icon.png');
  copyIfExists('README.md');
  copyIfExists('LICENSE');
  copyIfExists('.vscodeignore');
  copyAbsolutePathIfExists(path.join(webviewUiRoot, 'dist'), path.join('webview-ui', 'dist'));

  const stagedWorkspacePackages = new Set();
  const stagedDependencyKeys = new Set();

  for (const dependencyName of Object.keys(extensionPackageJson.dependencies ?? {})) {
    if (!workspacePackages.has(dependencyName)) {
      continue;
    }

    stageWorkspacePackage(
      dependencyName,
      workspacePackages,
      stagedWorkspacePackages,
      stagedDependencyKeys
    );
  }
}

fs.rmSync(outputPath, { force: true });
ensureDir(artifactsDir);

const workspacePackages = loadWorkspacePackages();
const builtWorkspacePackages = new Set();

for (const dependencyName of Object.keys(extensionPackageJson.dependencies ?? {})) {
  if (!workspacePackages.has(dependencyName)) {
    continue;
  }

  buildWorkspacePackage(dependencyName, workspacePackages, builtWorkspacePackages);
}

runCommand(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'build'], webviewUiRoot);

// 실제 패키징은 스테이징 결과물을 사용하지만, extension 엔트리 번들은 먼저 최신 상태로 맞춥니다.
runCommand(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'compile'], extensionRoot);

stageExtensionPackage(workspacePackages);

runCommand(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['dlx', '@vscode/vsce', 'package', '--out', outputPath],
  stagingDir
);

console.log(`[package:vsix] VSIX 생성 완료: ${outputPath}`);
