/**
 * MessageRouter — Webview ↔ Extension Host 메시지 라우터
 *
 * Webview에서 수신한 InboundMessage를 type별 핸들러로 분기한다.
 * 1단계: Git 관련 메시지는 GitMessageHandler가 담당한다.
 * 미구현 핸들러(추천, 스냅샷, 병합 분석)는 stub 응답을 반환한다.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { GitMessageHandler } from '../features/git/GitMessageHandler';
import { RecommendationHandler } from '../features/recommendation/RecommendationHandler';
import {
  InboundMessage,
  InboundMessageSchema,
  OutboundMessage,
  ErrorCode
} from '@gitcat/shared-types';

/**
 * Webview에서 오는 모든 메시지를 중앙에서 검증하고 각 핸들러로 분기하는 라우터입니다.
 */
export class MessageRouter {
  private readonly gitHandler: GitMessageHandler | null;
  private readonly recommendationHandler: RecommendationHandler | null;
  private readonly webviews = new Set<vscode.Webview>();

  constructor(
    private readonly dbInstance: any,
    gitHandler?: GitMessageHandler,
    recommendationHandler?: RecommendationHandler,
  ) {
    this.gitHandler = gitHandler ?? null;
    this.recommendationHandler = recommendationHandler ?? null;
  }

  public registerWebview(webview: vscode.Webview): vscode.Disposable {
    this.webviews.add(webview);
    return new vscode.Disposable(() => {
      this.webviews.delete(webview);
    });
  }

  public broadcast(message: OutboundMessage | { type: string; payload?: unknown }): void {
    for (const webview of this.webviews) {
      webview.postMessage(message).then(
        undefined,
        (error) => console.warn('[GitCat] Failed to post message to webview:', error),
      );
    }
  }

  public async route(rawMessage: any, webview: vscode.Webview) {
    // 1. Zod를 이용한 메시지 규격 검증
    const parseResult = InboundMessageSchema.safeParse(rawMessage);

    if (!parseResult.success) {
      console.error('[GitCat] Invalid inbound message:', parseResult.error);
      this.postError(webview, 'INVALID_PARAMETER', `메시지 규격이 올바르지 않습니다: ${parseResult.error.message}`);
      return;
    }

    const message = parseResult.data as InboundMessage;
    console.log(`[GitCat] Processing message: ${message.type}`, message.payload);

    try {
      // Git 핸들러에 우선 위임
      if (this.gitHandler) {
        const handled = await this.gitHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }

      // Recommendation 핸들러 위임
      if (this.recommendationHandler) {
        const handled = await this.recommendationHandler.handle(message.type, message.payload, webview);
        if (handled) return;
      }

      // 핸들러가 없거나 처리 못 한 메시지 — type별 분기
      switch (message.type) {
        // ─── 스냅샷 관련 (3단계 구현) ─────────────────────────────────────
        case 'GET_SNAPSHOT_LIST':
          webview.postMessage({ type: 'SNAPSHOT_LIST', payload: { snapshots: [] } });
          break;

        case 'CREATE_SNAPSHOT':
          this.sendNotImplemented(webview, 'CREATE_SNAPSHOT', '스냅샷 생성 (3단계 구현 예정)');
          break;

        case 'DELETE_SNAPSHOT':
          this.sendNotImplemented(webview, 'DELETE_SNAPSHOT', '스냅샷 삭제 (3단계 구현 예정)');
          break;

        case 'RESTORE_SNAPSHOT':
          this.sendNotImplemented(webview, 'RESTORE_SNAPSHOT', '스냅샷 원복 (3단계 구현 예정)');
          break;

        case 'RENAME_SNAPSHOT':
          this.sendNotImplemented(webview, 'RENAME_SNAPSHOT', '스냅샷 이름 변경 (3단계 구현 예정)');
          break;

        case 'TOGGLE_SNAPSHOT_STAR':
          this.sendNotImplemented(webview, 'TOGGLE_SNAPSHOT_STAR', '체크포인트 지정 (3단계 구현 예정)');
          break;

        case 'GET_SNAPSHOT_FILES':
          this.sendNotImplemented(webview, 'GET_SNAPSHOT_FILES', '스냅샷 파일 목록 (3단계 구현 예정)');
          break;

        case 'SET_CHECKPOINT':
          this.sendNotImplemented(webview, 'SET_CHECKPOINT', '체크포인트 설정 (3단계 구현 예정)');
          break;

        // ─── 추천 관련 (2단계 구현) ──────────────────────────────────────
        case 'RECOMMEND_COMMIT':
          this.sendNotImplemented(webview, 'RECOMMEND_COMMIT', '커밋 메시지 추천 (2단계 구현 예정)');
          break;

        case 'RECOMMEND_BRANCH':
          this.sendNotImplemented(webview, 'RECOMMEND_BRANCH', '브랜치명 추천 (2단계 구현 예정)');
          break;

        case 'RECOMMEND_PR':
          this.sendNotImplemented(webview, 'RECOMMEND_PR', 'PR 설명 추천 핸들러가 등록되지 않았습니다.');
          break;

        case 'APPLY_COMMIT':
          this.sendNotImplemented(webview, 'APPLY_COMMIT', '추천 커밋 적용 (Git 핸들러 없음)');
          break;

        // ─── 병합 분석 관련 (4단계 구현) ─────────────────────────────────
        case 'ANALYZE_CONFLICT':
          this.sendNotImplemented(webview, 'ANALYZE_CONFLICT', '충돌 분석 (4단계 구현 예정)');
          break;

        case 'ACCEPT_MERGE':
          this.sendNotImplemented(webview, 'ACCEPT_MERGE', '병합안 수락 (4단계 구현 예정)');
          break;

        case 'REJECT_MERGE':
          this.sendNotImplemented(webview, 'REJECT_MERGE', '병합안 거절 (4단계 구현 예정)');
          break;

        case 'GET_AI_DRAFT':
          this.sendNotImplemented(webview, 'GET_AI_DRAFT', 'AI 초안 조회 (4단계 구현 예정)');
          break;

        case 'REJECT_AI_DRAFT':
          this.sendNotImplemented(webview, 'REJECT_AI_DRAFT', 'AI 초안 거절 (4단계 구현 예정)');
          break;

        // ─── 유틸리티 ─────────────────────────────────────────────────────
        case 'OPEN_FILE_DIFF':
          await this.handleOpenFileDiff((message.payload as any));
          break;

        case 'GET_WORKSPACE_TREE':
          await this.handleGetWorkspaceTree(webview);
          break;

        case 'OPEN_WORKSPACE_FILE':
          await this.handleOpenWorkspaceFile((message.payload as any));
          break;

        case 'OPEN_DIFF_EDITOR':
          vscode.window.showInformationMessage(
            `GitCat: Diff 에디터 열기 — ${(message.payload as any).filePath}`,
          );
          break;

        case 'SET_CONFIG':
          console.log('[GitCat] SET_CONFIG received', message.payload);
          break;

        // ─── Git 관련 (GitHandler가 없을 때의 기본 응답) ───────────────
        case 'GET_BRANCH_LIST':
          webview.postMessage({ type: 'BRANCH_LIST', payload: { branches: [] } });
          break;

        case 'REFRESH_STATUS':
          webview.postMessage({
            type: 'GIT_STATUS_UPDATED',
            payload: { branch: '', isClean: true, staged: [], unstaged: [] }
          });
          break;

        default:
          console.warn(`[GitCat] Unhandled message type: ${message.type}`);
          this.postError(webview, 'INTERNAL_ERROR', `Unhandled message type: ${message.type}`);
      }
    } catch (error: any) {
      console.error(`[GitCat] Error handling message ${message.type}:`, error);
      this.postError(webview, 'INTERNAL_ERROR', error?.message ?? String(error));
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async handleOpenFileDiff(payload: { filePath: string; snapshotId?: string }) {
    vscode.window.showInformationMessage(`GitCat: 파일 비교 요청 — ${payload.filePath}`);
  }

  private async handleGetWorkspaceTree(webview: vscode.Webview): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      webview.postMessage({
        type: 'WORKSPACE_TREE',
        payload: { tree: { rootName: 'No workspace', nodes: [], totalFiles: 0, truncated: false } },
      });
      return;
    }

    const maxFiles = 1200;
    const exclude = '{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/.vscode/gitcat/**,**/.next/**,**/coverage/**}';
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*'), exclude, maxFiles);
    const rootName = path.basename(folder.uri.fsPath) || folder.name;
    const nodes = this.buildWorkspaceTree(
      files
        .map((uri) => path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, '/'))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    );

    webview.postMessage({
      type: 'WORKSPACE_TREE',
      payload: {
        tree: {
          rootName,
          nodes,
          totalFiles: files.length,
          truncated: files.length >= maxFiles,
        },
      },
    });
  }

  private buildWorkspaceTree(filePaths: string[]) {
    type Node = {
      name: string;
      path: string;
      type: 'file' | 'directory';
      children?: Node[];
    };

    const root: Node[] = [];
    const directoryMap = new Map<string, Node[]>();
    directoryMap.set('', root);

    for (const filePath of filePaths) {
      const segments = filePath.split('/').filter(Boolean);
      let currentPath = '';

      segments.forEach((segment, index) => {
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        const siblings = directoryMap.get(parentPath) ?? root;
        const isFile = index === segments.length - 1;

        if (isFile) {
          if (!siblings.some((node) => node.path === currentPath)) {
            siblings.push({ name: segment, path: currentPath, type: 'file' });
          }
          return;
        }

        let directory = siblings.find((node) => node.path === currentPath && node.type === 'directory');
        if (!directory) {
          directory = { name: segment, path: currentPath, type: 'directory', children: [] };
          siblings.push(directory);
        }
        if (!directoryMap.has(currentPath)) {
          directoryMap.set(currentPath, directory.children ?? []);
        }
      });
    }

    const sortNodes = (nodes: Node[]) => {
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      nodes.forEach((node) => {
        if (node.children) sortNodes(node.children);
      });
    };
    sortNodes(root);

    return root;
  }

  private async handleOpenWorkspaceFile(payload: { filePath: string; status?: string }): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;

    if (payload.status === 'DELETED') {
      vscode.window.showInformationMessage(`GitCat: ${payload.filePath} is deleted in the working tree.`);
      return;
    }

    const rootPath = path.resolve(folder.uri.fsPath);
    const targetPath = path.resolve(rootPath, payload.filePath);
    const isInsideWorkspace = targetPath === rootPath || targetPath.startsWith(`${rootPath}${path.sep}`);
    if (!isInsideWorkspace) {
      throw new Error('Cannot open a file outside the workspace.');
    }

    const targetUri = vscode.Uri.file(targetPath);
    await vscode.commands.executeCommand('vscode.open', targetUri, {
      preview: true,
      preserveFocus: false,
    });
  }

  private sendNotImplemented(webview: vscode.Webview, type: string, description: string) {
    console.log(`[GitCat] Not implemented yet: ${type} — ${description}`);
    webview.postMessage({
      type: 'NOTIFICATION',
      payload: { type: 'info', message: `${description}` },
    });
  }

  private postError(webview: vscode.Webview, code: ErrorCode, message: string) {
    webview.postMessage({
      type: 'ERROR',
      payload: { code, message }
    } as OutboundMessage);
  }
}
