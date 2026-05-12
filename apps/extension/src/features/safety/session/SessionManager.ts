import * as vscode from 'vscode';
import { SessionType, SessionMeta } from '@gitcat/shared-types';

export class SessionManager {
  private currentSession: SessionMeta | null = null;
  private baselines = new Map<string, string>(); // filePath -> initial text
  private currentTextCache = new Map<string, string>(); // filePath -> latest text
  private changedFiles = new Set<string>(); // filePaths
  private dirtyFiles = new Set<string>(); // filePaths currently with unsaved changes

  constructor() {
    console.log('SessionManager initialized');
  }

  public get activeSession(): SessionMeta | null {
    return this.currentSession;
  }

  public get sessionChangedFiles(): Set<string> {
    return this.changedFiles;
  }

  public get sessionBaselines(): Map<string, string> {
    return this.baselines;
  }

  public get sessionDirtyFiles(): Set<string> {
    return this.dirtyFiles;
  }

  /**
   * AI 작업을 시작할 때 호출
   */
  public startAiSession(baseSnapshotId?: string): string {
    return this.startSession('ai', baseSnapshotId);
  }

  /**
   * 수동 편집 시 호출
   */
  public startManualSession(baseSnapshotId?: string): string {
    return this.startSession('manual', baseSnapshotId);
  }

  private startSession(type: SessionType, baseSnapshotId?: string): string {
    if (this.currentSession) {
      this.endSession();
    }

    const sessionId = `session_${Date.now()}`;
    this.currentSession = {
      sessionId,
      type,
      status: 'active',
      startedAt: new Date().toISOString(),
      baseSnapshotId,
    };

    this.baselines.clear();
    this.currentTextCache.clear();
    this.changedFiles.clear();
    this.dirtyFiles.clear();

    console.log(`Started ${type} session: ${sessionId}`);
    return sessionId;
  }

  /**
   * 진행 중인 세션을 마감하고 상태 반환
   */
  public endSession(): SessionMeta | undefined {
    if (!this.currentSession) {
      return undefined;
    }

    this.currentSession.status = 'completed';
    this.currentSession.endedAt = new Date().toISOString();
    
    const endedSession = { ...this.currentSession };
    this.currentSession = null;
    
    console.log(`Ended session: ${endedSession.sessionId}`);
    return endedSession;
  }

  /**
   * 문서 변경 시 훅 (onDidChangeTextDocument)
   */
  public async handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
    const doc = event.document;
    if (doc.uri.scheme !== 'file') {
      return;
    }
    
    const fsPath = doc.uri.fsPath;
    if (this.isIgnoredPath(fsPath)) {
      return;
    }

    // 변경이 일어났는데 세션이 없다면 수동 세션으로 간주하여 자동 시작
    if (!this.currentSession) {
      this.startManualSession();
    }

    this.changedFiles.add(fsPath);
    this.currentTextCache.set(fsPath, doc.getText());

    if (doc.isDirty) {
      this.dirtyFiles.add(fsPath);
    } else {
      this.dirtyFiles.delete(fsPath);
    }

    // Baseline 저장 (해당 세션 내에서 파일별로 최초 1회만)
    if (!this.baselines.has(fsPath)) {
      try {
        // 아직 저장되지 않은 변경 내역이 있더라도 디스크에 있는 파일 내용은 변경 전 원본 상태를 가짐
        const fileData = await vscode.workspace.fs.readFile(doc.uri);
        this.baselines.set(fsPath, Buffer.from(fileData).toString('utf8'));
      } catch (e) {
        // 새로 생성된 파일이거나 읽기 실패 시 빈 문자열 처리
        this.baselines.set(fsPath, '');
      }
    }
  }

  /**
   * 문서 저장 시 훅 (onDidSaveTextDocument)
   */
  public handleDocumentSave(doc: vscode.TextDocument) {
    if (doc.uri.scheme !== 'file') {
      return;
    }
    const fsPath = doc.uri.fsPath;
    this.dirtyFiles.delete(fsPath);
  }

  private isIgnoredPath(fsPath: string): boolean {
    const normalizedPath = fsPath.replace(/\\/g, '/');
    return (
      normalizedPath.includes('/.git/') ||
      normalizedPath.includes('/node_modules/') ||
      normalizedPath.includes('/dist/') ||
      normalizedPath.includes('/build/')
    );
  }
}
