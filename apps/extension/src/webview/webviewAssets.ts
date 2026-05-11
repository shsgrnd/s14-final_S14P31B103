import * as fs from 'fs';
import * as path from 'path';

function hasWebviewIndex(distPath: string): boolean {
  return fs.existsSync(path.join(distPath, 'index.html'));
}

export function resolveWebviewDistPath(extensionPath: string): string {
  const packagedDistPath = path.join(extensionPath, 'webview-ui', 'dist');
  if (hasWebviewIndex(packagedDistPath)) {
    return packagedDistPath;
  }

  const workspaceDistPath = path.join(extensionPath, '..', 'webview-ui', 'dist');
  if (hasWebviewIndex(workspaceDistPath)) {
    return workspaceDistPath;
  }

  return packagedDistPath;
}
