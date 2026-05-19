import * as vscode from 'vscode';
import { SessionMeta, SessionType } from '@gitcat/shared-types';
import { AiChangeDetector } from './AiChangeDetector';
import { ISnapshotService } from '../snapshot/ISnapshotService';
import { t } from '../../../i18n';

export class SafetySessionCoordinator {
    private currentSession: SessionMeta | null = null;
    private baselines = new Map<string, Uint8Array>();
    private currentTextCache = new Map<string, string>();
    private changedFiles = new Set<string>();
    private dirtyFiles = new Set<string>();
    private aiChangeDetector = new AiChangeDetector();

    private interSessionUserBaselines = new Map<string, Uint8Array>();
    private interSessionUserChangedFiles = new Set<string>();

    private sessionTimer: NodeJS.Timeout | null = null;
    private readonly SESSION_TIMEOUT_MS = 45 * 1000;

    constructor(private readonly snapshotService: ISnapshotService) {
        console.log('SafetySessionCoordinator initialized');
    }

    public get activeSession(): SessionMeta | null {
        return this.currentSession;
    }

    public get sessionChangedFiles(): Set<string> {
        return this.changedFiles;
    }

    public get sessionBaselines(): Map<string, Uint8Array> {
        return this.baselines;
    }

    public get sessionDirtyFiles(): Set<string> {
        return this.dirtyFiles;
    }

    public async startAiSession(baseSnapshotId?: string): Promise<string> {
        return this.startSession('ai', baseSnapshotId);
    }

    public async startManualSession(baseSnapshotId?: string): Promise<string> {
        return this.startSession('manual', baseSnapshotId);
    }

    private async startSession(type: SessionType, baseSnapshotId?: string): Promise<string> {
        if (this.currentSession) {
            await this.endSession();
        }

        if (type === 'ai' && this.interSessionUserChangedFiles.size > 0) {
            await this.snapshotService.createSnapshot('auto_dirty_before_ai', {
                reason: t('session.snapshot.autoDirtyBeforeAi'),
                changedFiles: Array.from(this.interSessionUserChangedFiles),
                userBaselines: new Map(this.interSessionUserBaselines),
                userChangedFiles: Array.from(this.interSessionUserChangedFiles),
            });
            this.interSessionUserBaselines.clear();
            this.interSessionUserChangedFiles.clear();
        } else if (type === 'ai' && this.dirtyFiles.size > 0) {
            await this.snapshotService.createSnapshot('auto_dirty_before_ai', {
                reason: t('session.snapshot.autoDirtyCurrentBeforeAi'),
                changedFiles: Array.from(this.dirtyFiles),
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

        console.log(`Started ${type} session: ${sessionId}`);
        this.resetSessionTimer();
        return sessionId;
    }

    public async endSession(reason?: string): Promise<SessionMeta | undefined> {
        if (!this.currentSession) {
            return undefined;
        }

        if (this.snapshotService.isRestoreOperationActive()) {
            console.log('[SafetySessionCoordinator] restore in progress, deferred session end.');
            this.resetSessionTimer();
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

        const snapshotType = endedSession.type === 'ai' ? 'ai_result' : 'manual_edit_result';
        await this.snapshotService.createSnapshot(snapshotType, {
            sessionId: endedSession.sessionId,
            reason: reason || t('session.reason.default'),
            changedFiles: Array.from(this.changedFiles),
            baselines: new Map(this.baselines),
            currentContents: this.buildCurrentContentsSnapshot(),
        });

        if (endedSession.type === 'ai') {
            for (const filePath of this.baselines.keys()) {
                if (!this.interSessionUserBaselines.has(filePath)) {
                    const currentText = this.currentTextCache.get(filePath);
                    this.interSessionUserBaselines.set(
                        filePath,
                        currentText ? Buffer.from(currentText, 'utf8') : new Uint8Array(),
                    );
                }
            }
        }

        return endedSession;
    }

    public async createManualSnapshot(title?: string): Promise<string | undefined> {
        if (this.snapshotService.isRestoreOperationActive()) {
            return undefined;
        }

        if (this.sessionTimer) {
            clearTimeout(this.sessionTimer);
            this.sessionTimer = null;
        }

        const snapshotId = await this.snapshotService.createSnapshot('savepoint', {
            reason: title?.trim() || t('session.snapshot.manual'),
            force: true,
            changedFiles: Array.from(this.changedFiles),
            baselines: new Map(this.baselines),
            currentContents: this.buildCurrentContentsSnapshot(),
        });

        this.currentSession = null;
        this.baselines.clear();
        this.currentTextCache.clear();
        this.changedFiles.clear();

        return snapshotId;
    }

    private resetSessionTimer() {
        if (this.sessionTimer) {
            clearTimeout(this.sessionTimer);
        }
        this.sessionTimer = setTimeout(async () => {
            console.log(`[SafetySessionCoordinator] session timeout reached (${this.SESSION_TIMEOUT_MS}ms)`);
            await this.endSession(t('session.reason.timeout'));
        }, this.SESSION_TIMEOUT_MS);
    }

    public async handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
        if (this.snapshotService.isRestoreOperationActive()) {
            return;
        }

        const doc = event.document;
        console.log(`[DEBUG] handleDocumentChange called: scheme=${doc.uri.scheme}, changes=${event.contentChanges.length}`);

        if (doc.uri.scheme !== 'file') {
            return;
        }

        const fsPath = doc.uri.fsPath;
        if (this.isIgnoredPath(fsPath)) {
            return;
        }

        const isAiChange = await this.aiChangeDetector.analyzeChange(event);

        if (isAiChange) {
            if (!this.currentSession || this.currentSession.type !== 'ai') {
                await this.startAiSession();
            }
        } else if (!this.currentSession) {
            this.interSessionUserChangedFiles.add(fsPath);
            if (!this.interSessionUserBaselines.has(fsPath)) {
                try {
                    const fileData = await vscode.workspace.fs.readFile(doc.uri);
                    this.interSessionUserBaselines.set(fsPath, fileData);
                } catch {
                    this.interSessionUserBaselines.set(fsPath, new Uint8Array());
                }
            }

            if (!this.currentSession) {
                this.interSessionUserChangedFiles.add(fsPath);
                if (!this.interSessionUserBaselines.has(fsPath)) {
                    try {
                        const fileData = await vscode.workspace.fs.readFile(doc.uri);
                        this.interSessionUserBaselines.set(fsPath, fileData);
                    } catch {
                        this.interSessionUserBaselines.set(fsPath, new Uint8Array());
                    }
                }
                if (!this.currentSession) {
                    await this.startManualSession();
                }
            }
        }

        this.changedFiles.add(fsPath);
        this.currentTextCache.set(fsPath, doc.getText());

        if (doc.isDirty) {
            this.dirtyFiles.add(fsPath);
        } else {
            this.dirtyFiles.delete(fsPath);
        }

        if (this.currentSession && !this.baselines.has(fsPath)) {
            try {
                const fileData = await vscode.workspace.fs.readFile(doc.uri);
                this.baselines.set(fsPath, fileData);
            } catch {
                this.baselines.set(fsPath, new Uint8Array());
            }
        }

        this.resetSessionTimer();
    }

    public handleDocumentSave(doc: vscode.TextDocument) {
        if (this.snapshotService.isRestoreOperationActive()) {
            return;
        }

        if (doc.uri.scheme !== 'file') {
            return;
        }
        const fsPath = doc.uri.fsPath;
        this.dirtyFiles.delete(fsPath);
    }

    public resetAfterRestore(): void {
        if (this.sessionTimer) {
            clearTimeout(this.sessionTimer);
            this.sessionTimer = null;
        }

        this.currentSession = null;
        this.baselines.clear();
        this.currentTextCache.clear();
        this.changedFiles.clear();
        this.dirtyFiles.clear();
        this.interSessionUserBaselines.clear();
        this.interSessionUserChangedFiles.clear();
        console.log('[SafetySessionCoordinator] reset state after snapshot restore.');
    }

    private buildCurrentContentsSnapshot(): Map<string, Uint8Array | null> {
        const currentContents = new Map<string, Uint8Array | null>();
        for (const filePath of this.changedFiles) {
            const currentText = this.currentTextCache.get(filePath);
            if (currentText === undefined) {
                continue;
            }
            currentContents.set(filePath, Buffer.from(currentText, 'utf8'));
        }
        return currentContents;
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
