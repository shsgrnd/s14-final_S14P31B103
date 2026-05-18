import * as vscode from 'vscode';

let channel: vscode.OutputChannel | null = null;

/**
 * Extension activate 시 한 번 호출합니다. Output 패널 드롭다운에 "GitCat"이 표시됩니다.
 */
export function registerGitCatOutputChannel(context: vscode.ExtensionContext): vscode.OutputChannel {
  channel = vscode.window.createOutputChannel('GitCat');
  context.subscriptions.push(channel);
  channel.appendLine(
    '[GitCat] 진단 로그 채널입니다. Merge 재시도·가드·AI 파이프라인 등은 여기에 기록될 수 있습니다.',
  );
  return channel;
}

function timestamp(): string {
  return new Date().toLocaleTimeString('ko-KR', { hour12: false });
}

export function gitcatLog(message: string): void {
  const line = `[${timestamp()}] ${message}`;
  channel?.appendLine(line);
  console.log(message);
}

export function gitcatLogWarn(message: string, ...args: unknown[]): void {
  const suffix = args.length ? ` ${args.map((a) => String(a)).join(' ')}` : '';
  gitcatLog(`WARN ${message}${suffix}`);
  console.warn(message, ...args);
}

/** Output 패널에서 GitCat 탭을 앞으로 (선택) */
export function showGitCatOutput(preserveFocus: boolean = true): void {
  channel?.show(preserveFocus);
}
