import * as vscode from 'vscode';
import { SessionType, SessionMeta } from '@gitcat/shared-types';
import { AiChangeDetector } from './AiChangeDetector';
import { ISnapshotService } from '../snapshot/ISnapshotService';

export class SafetySessionCoordinator {
    private currentSession: SessionMeta | null = null;
    private baselines = new Map<string, string>(); // filePath -> initial text
    private currentTextCache = new Map<string, string>(); // filePath -> latest text
    private changedFiles = new Set<string>(); // filePaths
    private dirtyFiles = new Set<string>(); // filePaths currently with unsaved changes
    private aiChangeDetector = new AiChangeDetector();
    
    // Sliding Window
    private sessionTimer: NodeJS.Timeout | null = null;
    private readonly SESSION_TIMEOUT_MS = 45 * 1000; // 기본 45초

    constructor(private readonly snapshotService: ISnapshotService) {
        console.log('SafetySessionCoordinator initialized');
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
    public async startAiSession(baseSnapshotId?: string): Promise<string> {
        return this.startSession('ai', baseSnapshotId);
    }

    /**
     * 수동 편집 시 호출
     */
    public async startManualSession(baseSnapshotId?: string): Promise<string> {
        return this.startSession('manual', baseSnapshotId);
    }

    private async startSession(type: SessionType, baseSnapshotId?: string): Promise<string> {
        if (this.currentSession) {
            await this.endSession();
        }

        // AI 작업 시작 전 더티(Dirty) 상태 체크
        if (type === 'ai' && this.dirtyFiles.size > 0) {
            await this.snapshotService.createSnapshot('auto_dirty_before_ai', {
                reason: 'AI 작업 시작 전 더티 상태 스냅샷 자동 생성',
                changedFiles: Array.from(this.dirtyFiles)
            });
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
        
        // dirtyFiles는 세션과 무관하게 워크스페이스 상태이므로 클리어하지 않음 (다만 새 세션에서 변경 감지를 다시 쌓음)

        console.log(`Started ${type} session: ${sessionId}`);
        this.resetSessionTimer();
        return sessionId;
    }

    /**
     * 진행 중인 세션을 마감하고 상태 반환
     */
    public async endSession(reason?: string): Promise<SessionMeta | undefined> {
        if (!this.currentSession) {
            return undefined;
        }

        if (this.sessionTimer) {
            clearTimeout(this.sessionTimer);
            this.sessionTimer = null;
        }

        this.currentSession.status = 'completed';
        this.currentSession.endedAt = new Date().toISOString();
        
        const endedSession = { ...this.currentSession };
        this.currentSession = null;
        
        console.log(`Ended session: ${endedSession.sessionId}${reason ? ` (Reason: ${reason})` : ''}`);

        // 세션 종료 후 결과 스냅샷 생성 요청
        const snapshotType = endedSession.type === 'ai' ? 'ai_result' : 'manual_edit_result';
        await this.snapshotService.createSnapshot(snapshotType, {
            sessionId: endedSession.sessionId,
            reason: reason || '세션 종료 (유휴 상태 도달)',
            changedFiles: Array.from(this.changedFiles),
            baselines: new Map(this.baselines)
        });

        return endedSession;
    }

    /**
     * 세션 유휴 타이머를 초기화 (Sliding Window)
     */
    private resetSessionTimer() {
        if (this.sessionTimer) {
            clearTimeout(this.sessionTimer);
        }
        this.sessionTimer = setTimeout(async () => {
            console.log(`[SafetySessionCoordinator] 세션 유휴 타임아웃 도달 (${this.SESSION_TIMEOUT_MS}ms)`);
            await this.endSession('유휴 시간 타임아웃');
        }, this.SESSION_TIMEOUT_MS);
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

        // AI성 대량 변경인지 분석
        const isAiChange = await this.aiChangeDetector.analyzeChange(event);

        if (isAiChange) {
            if (!this.currentSession || this.currentSession.type !== 'ai') {
                await this.startAiSession();
            }
        } else {
            // 변경이 일어났는데 세션이 없다면 수동 세션으로 간주하여 자동 시작
            if (!this.currentSession) {
                await this.startManualSession();
            }
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

        // 파일 변경이 감지될 때마다 타이머를 리셋하여 세션을 연장함 (Sliding Window)
        this.resetSessionTimer();
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
