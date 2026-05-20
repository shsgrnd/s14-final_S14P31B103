import * as vscode from 'vscode';
import { SessionMeta, SessionType } from '@gitcat/shared-types';
import { AiChangeDetector } from './AiChangeDetector';
import { ISnapshotService } from '../snapshot/ISnapshotService';
import { t } from '../../../i18n';

export class SafetySessionCoordinator {
    private currentSession: SessionMeta | null = null;
    private baselines = new Map<string, Uint8Array>();
    private currentTextCache = new Map<string, string>();
    private currentContentOverrides = new Map<string, Uint8Array | null>();
    private lastObservedText = new Map<string, string>();
    private observedFileContents = new Map<string, Uint8Array>();
    private pendingSaveBaselines = new Map<string, Uint8Array>();
    private changedFiles = new Set<string>();
    private dirtyFiles = new Set<string>();
    private aiChangeDetector = new AiChangeDetector();
    private lastNonFileAiHintAt = 0;
    private readonly SAVE_RECOVERY_AI_HINT_WINDOW_MS = 10 * 1000;
    private workspaceStateWarmupPromise: Promise<void> | null = null;

    private interSessionUserBaselines = new Map<string, Uint8Array>();
    private interSessionUserChangedFiles = new Set<string>();
    private lastKnownBranchName: string | null = null;
    private ignoreFilesystemEventsUntil = 0;

    private sessionTimer: NodeJS.Timeout | null = null;
    private readonly SESSION_TIMEOUT_MS = 45 * 1000;
    private readonly BRANCH_SWITCH_FILESYSTEM_COOLDOWN_MS = 2 * 1000;

    constructor(
        private readonly snapshotService: ISnapshotService,
        private readonly currentBranchResolver?: () => Promise<string | null> | string | null,
    ) {
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

    public rememberDocumentState(doc: vscode.TextDocument): void {
        if (doc.uri.scheme !== 'file') {
            return;
        }

        const fsPath = doc.uri.fsPath;
        if (this.isIgnoredPath(fsPath)) {
            return;
        }

        const text = doc.getText();
        this.lastObservedText.set(fsPath, text);
        this.observedFileContents.set(fsPath, Buffer.from(text, 'utf8'));
    }

    public warmWorkspaceFileState(): Promise<void> {
        if (!this.workspaceStateWarmupPromise) {
            this.workspaceStateWarmupPromise = this.doWarmWorkspaceFileState();
        }
        return this.workspaceStateWarmupPromise;
    }

    public async startAiSession(baseSnapshotId?: string): Promise<string> {
        if (await this.resetIfBranchChanged()) {
            return this.startSession('ai', baseSnapshotId);
        }
        return this.startSession('ai', baseSnapshotId);
    }

    public async startManualSession(baseSnapshotId?: string): Promise<string> {
        if (await this.resetIfBranchChanged()) {
            return this.startSession('manual', baseSnapshotId);
        }
        return this.startSession('manual', baseSnapshotId);
    }

    private async startSession(type: SessionType, baseSnapshotId?: string): Promise<string> {
        if (this.currentSession) {
            if (!this.currentSession.baseSnapshotId && baseSnapshotId) {
                this.currentSession.baseSnapshotId = baseSnapshotId;
            }
            this.resetSessionTimer();
            return this.currentSession.sessionId;
        }

        const shouldCreateAutoDirtyBeforeAi = type === 'ai';
        if (shouldCreateAutoDirtyBeforeAi) {
            const pendingPaths = this.interSessionUserChangedFiles.size > 0
                ? Array.from(this.interSessionUserChangedFiles)
                : Array.from(this.dirtyFiles);
            if (pendingPaths.length > 0) {
                const baselines = await this.collectBaselinesForPaths(pendingPaths);
                const currentContents = this.buildCurrentContentsForPaths(pendingPaths);
                await this.snapshotService.createSnapshot('auto_dirty_before_ai', {
                    reason: this.interSessionUserChangedFiles.size > 0
                        ? t('session.snapshot.autoDirtyBeforeAi')
                        : t('session.snapshot.autoDirtyCurrentBeforeAi'),
                    changedFiles: pendingPaths,
                    baselines,
                    currentContents,
                });
            }
            this.interSessionUserBaselines.clear();
            this.interSessionUserChangedFiles.clear();
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
        this.currentContentOverrides.clear();
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
        const trackedPaths = this.getTrackedFilePaths();
        await this.snapshotService.createSnapshot(snapshotType, {
            sessionId: endedSession.sessionId,
            reason: reason || t('session.reason.default'),
            changedFiles: trackedPaths,
            baselines: new Map(this.baselines),
            currentContents: this.buildCurrentContentsForPaths(trackedPaths),
        });

        if (endedSession.type === 'ai') {
            for (const filePath of this.baselines.keys()) {
                if (!this.interSessionUserBaselines.has(filePath)) {
                    const currentText = this.currentTextCache.get(filePath);
                    const currentBytes = this.currentContentOverrides.get(filePath);
                    this.interSessionUserBaselines.set(
                        filePath,
                        currentBytes
                            ?? (currentText ? Buffer.from(currentText, 'utf8') : new Uint8Array()),
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
        if (await this.resetIfBranchChanged()) {
            return undefined;
        }

        if (this.sessionTimer) {
            clearTimeout(this.sessionTimer);
            this.sessionTimer = null;
        }

        const snapshotId = await this.snapshotService.createSnapshot('savepoint', {
            reason: title?.trim() || t('session.snapshot.manual'),
            force: true,
            changedFiles: this.getTrackedFilePaths(),
            baselines: new Map(this.baselines),
            currentContents: this.buildCurrentContentsSnapshot(),
        });

        this.currentSession = null;
        this.baselines.clear();
        this.currentTextCache.clear();
        this.currentContentOverrides.clear();
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
        if (await this.resetIfBranchChanged()) {
            return;
        }

        const doc = event.document;
        console.log(`[DEBUG] handleDocumentChange called: scheme=${doc.uri.scheme}, changes=${event.contentChanges.length}`);

        if (event.contentChanges.length === 0) {
            return;
        }

        if (this.isAiBridgeScheme(doc.uri.scheme)) {
            this.lastNonFileAiHintAt = Date.now();
        }

        if (doc.uri.scheme !== 'file') {
            return;
        }

        const fsPath = doc.uri.fsPath;
        if (this.isIgnoredPath(fsPath)) {
            return;
        }
        const previousObservedText = this.lastObservedText.get(fsPath);
        const previousObservedBytes = this.observedFileContents.get(fsPath);
        const baselineReadPromise: Promise<Uint8Array> | null = previousObservedText === undefined
            ? (async () => {
                if (previousObservedBytes) {
                    return previousObservedBytes;
                }
                try {
                    return await vscode.workspace.fs.readFile(doc.uri);
                } catch {
                    return new Uint8Array();
                }
            })()
            : null;

        if (
            event.reason === vscode.TextDocumentChangeReason.Undo ||
            event.reason === vscode.TextDocumentChangeReason.Redo
        ) {
            if (doc.isDirty) {
                const text = doc.getText();
                this.currentTextCache.set(fsPath, text);
                this.currentContentOverrides.set(fsPath, Buffer.from(text, 'utf8'));
                if (this.currentSession) {
                    this.changedFiles.add(fsPath);
                }
                this.dirtyFiles.add(fsPath);
            } else {
                this.currentTextCache.delete(fsPath);
                this.currentContentOverrides.delete(fsPath);
                this.dirtyFiles.delete(fsPath);
                if (!this.currentSession) {
                    this.changedFiles.delete(fsPath);
                    this.interSessionUserChangedFiles.delete(fsPath);
                    this.interSessionUserBaselines.delete(fsPath);
                }
            }
            return;
        }

        const isAiChange = await this.aiChangeDetector.analyzeChange(event);

        // Keep the current session type until it ends.
        // Mid-session switching (manual <-> ai) can create chained snapshots
        // for one logical edit burst (manual_result -> auto_dirty_before_ai -> ai_result).
        if (!this.currentSession) {
            if (isAiChange) {
                await this.startAiSession();
            } else {
                await this.startManualSession();
            }
        }

        this.changedFiles.add(fsPath);
        const currentText = doc.getText();
        this.currentTextCache.set(fsPath, currentText);
        this.currentContentOverrides.set(fsPath, Buffer.from(currentText, 'utf8'));
        this.lastObservedText.set(fsPath, currentText);

        if (doc.isDirty) {
            this.dirtyFiles.add(fsPath);
        } else {
            this.dirtyFiles.delete(fsPath);
        }

        if (this.currentSession && !this.baselines.has(fsPath)) {
            try {
                const beforeText = previousObservedText;
                if (beforeText === undefined) {
                    throw new Error('No previous observed text available');
                }
                this.baselines.set(fsPath, Buffer.from(beforeText, 'utf8'));
            } catch {
                try {
                    const fileData = baselineReadPromise
                        ? await baselineReadPromise
                        : await vscode.workspace.fs.readFile(doc.uri);
                    this.baselines.set(fsPath, fileData);
                } catch {
                    this.baselines.set(fsPath, new Uint8Array());
                }
            }
        }

        this.resetSessionTimer();
    }

    public async handleWillSaveDocument(doc: vscode.TextDocument): Promise<void> {
        if (this.snapshotService.isRestoreOperationActive()) {
            return;
        }
        if (await this.resetIfBranchChanged()) {
            return;
        }

        if (doc.uri.scheme !== 'file') {
            return;
        }

        const fsPath = doc.uri.fsPath;
        if (this.isIgnoredPath(fsPath) || this.changedFiles.has(fsPath) || this.baselines.has(fsPath)) {
            return;
        }

        try {
            const fileData = await vscode.workspace.fs.readFile(doc.uri);
            this.pendingSaveBaselines.set(fsPath, fileData);
        } catch {
            this.pendingSaveBaselines.set(fsPath, new Uint8Array());
        }
    }

    public async handleFilesystemChange(uri: vscode.Uri): Promise<void> {
        await this.handleFilesystemMutation(uri, 'changed');
    }

    public async handleFilesystemCreate(uri: vscode.Uri): Promise<void> {
        await this.handleFilesystemMutation(uri, 'created');
    }

    public async handleFilesystemDelete(uri: vscode.Uri): Promise<void> {
        await this.handleFilesystemMutation(uri, 'deleted');
    }

    private async collectBaselinesForPaths(paths: string[]): Promise<Map<string, Uint8Array>> {
        const baselines = new Map<string, Uint8Array>();
        for (const filePath of paths) {
            const cached = this.interSessionUserBaselines.get(filePath)
                ?? this.baselines.get(filePath)
                ?? this.observedFileContents.get(filePath);
            if (cached) {
                baselines.set(filePath, cached);
                continue;
            }

            try {
                const fileData = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
                baselines.set(filePath, fileData);
            } catch {
                baselines.set(filePath, new Uint8Array());
            }
        }
        return baselines;
    }

    private buildCurrentContentsForPaths(paths: Iterable<string>): Map<string, Uint8Array | null> {
        const currentContents = new Map<string, Uint8Array | null>();
        for (const filePath of paths) {
            if (this.currentContentOverrides.has(filePath)) {
                currentContents.set(filePath, this.currentContentOverrides.get(filePath) ?? null);
                continue;
            }
            const currentText = this.currentTextCache.get(filePath) ?? this.findOpenDocumentText(filePath);
            if (currentText === undefined) {
                continue;
            }
            currentContents.set(filePath, Buffer.from(currentText, 'utf8'));
        }
        return currentContents;
    }

    public async handleDocumentSave(doc: vscode.TextDocument): Promise<void> {
        if (this.snapshotService.isRestoreOperationActive()) {
            return;
        }
        if (await this.resetIfBranchChanged()) {
            return;
        }

        if (doc.uri.scheme !== 'file') {
            return;
        }
        const fsPath = doc.uri.fsPath;
        const currentText = doc.getText();
        const previousObservedText = this.lastObservedText.get(fsPath);
        const pendingSaveBaseline = this.pendingSaveBaselines.get(fsPath);
        const pendingSaveText = pendingSaveBaseline
            ? Buffer.from(pendingSaveBaseline).toString('utf8')
            : undefined;

        // Some edit flows (e.g. chat-editing bridge) may skip file-scheme contentChanges.
        // Recover missed tracking at save-time by comparing the previously observed text.
        const shouldRecoverFromSave =
            !this.changedFiles.has(fsPath) &&
            (
                (previousObservedText !== undefined && previousObservedText !== currentText) ||
                (pendingSaveText !== undefined && pendingSaveText !== currentText)
            );

        if (shouldRecoverFromSave) {
            if (!this.currentSession) {
                if (this.shouldTreatSaveRecoveryAsAi()) {
                    await this.startAiSession();
                } else {
                    await this.startManualSession();
                }
            }
            if (this.currentSession && !this.baselines.has(fsPath)) {
                if (previousObservedText !== undefined && previousObservedText !== currentText) {
                    this.baselines.set(fsPath, Buffer.from(previousObservedText, 'utf8'));
                } else if (pendingSaveBaseline !== undefined) {
                    this.baselines.set(fsPath, pendingSaveBaseline);
                }
            }
            this.changedFiles.add(fsPath);
            this.currentTextCache.set(fsPath, currentText);
            this.currentContentOverrides.set(fsPath, Buffer.from(currentText, 'utf8'));
            console.log(`[SafetySessionCoordinator] recovered missed file change on save: ${fsPath}`);
            this.resetSessionTimer();
        }

        this.pendingSaveBaselines.delete(fsPath);
        this.dirtyFiles.delete(fsPath);
        this.currentContentOverrides.delete(fsPath);
        this.rememberDocumentState(doc);
    }

    public resetAfterRestore(): void {
        if (this.sessionTimer) {
            clearTimeout(this.sessionTimer);
            this.sessionTimer = null;
        }

        this.currentSession = null;
        this.baselines.clear();
        this.currentTextCache.clear();
        this.currentContentOverrides.clear();
        this.lastObservedText.clear();
        this.observedFileContents.clear();
        this.workspaceStateWarmupPromise = null;
        this.pendingSaveBaselines.clear();
        this.changedFiles.clear();
        this.dirtyFiles.clear();
        this.interSessionUserBaselines.clear();
        this.interSessionUserChangedFiles.clear();
        console.log('[SafetySessionCoordinator] reset state after snapshot restore.');
        void this.warmWorkspaceFileState();
    }

    private buildCurrentContentsSnapshot(): Map<string, Uint8Array | null> {
        return this.buildCurrentContentsForPaths(this.getTrackedFilePaths());
    }

    private getTrackedFilePaths(): string[] {
        const tracked = new Set<string>();
        for (const filePath of this.changedFiles) {
            tracked.add(filePath);
        }
        for (const filePath of this.baselines.keys()) {
            tracked.add(filePath);
        }
        for (const filePath of this.currentTextCache.keys()) {
            tracked.add(filePath);
        }
        return Array.from(tracked);
    }

    private findOpenDocumentText(fsPath: string): string | undefined {
        const document = vscode.workspace.textDocuments.find((doc) => doc.uri.scheme === 'file' && doc.uri.fsPath === fsPath);
        return document?.getText();
    }

    private async doWarmWorkspaceFileState(): Promise<void> {
        try {
            const files = await vscode.workspace.findFiles(
                '**/*',
                '**/{.git,node_modules,dist,build,.gradle,target,out,.vscode/gitcat}/**',
            );
            let cachedCount = 0;
            for (const file of files) {
                if (file.scheme !== 'file' || this.isIgnoredPath(file.fsPath)) {
                    continue;
                }
                try {
                    const data = await vscode.workspace.fs.readFile(file);
                    this.observedFileContents.set(file.fsPath, data);
                    cachedCount += 1;
                } catch {
                    // Ignore unreadable files; they will fall back to live observation.
                }
            }
            console.log(`[SafetySessionCoordinator] warmed workspace file state for ${cachedCount} files.`);
        } catch (error) {
            console.warn('[SafetySessionCoordinator] failed to warm workspace file state:', error);
        }
    }

    private async handleFilesystemMutation(
        uri: vscode.Uri,
        mutation: 'changed' | 'created' | 'deleted',
    ): Promise<void> {
        if (this.snapshotService.isRestoreOperationActive() || uri.scheme !== 'file') {
            return;
        }
        if (await this.resetIfBranchChanged()) {
            return;
        }

        const fsPath = uri.fsPath;
        if (this.isIgnoredPath(fsPath)) {
            return;
        }
        if (Date.now() < this.ignoreFilesystemEventsUntil) {
            return;
        }
        if (await this.isDirectoryUri(uri)) {
            return;
        }

        const openDocument = vscode.workspace.textDocuments.find((doc) => doc.uri.scheme === 'file' && doc.uri.fsPath === fsPath);
        if (openDocument) {
            return;
        }

        const previousObservedBytes = this.observedFileContents.get(fsPath);
        let currentBytes: Uint8Array | null = null;
        if (mutation !== 'deleted') {
            try {
                currentBytes = await vscode.workspace.fs.readFile(uri);
            } catch {
                currentBytes = null;
            }
        }

        if (mutation === 'changed') {
            if (previousObservedBytes === undefined) {
                if (currentBytes) {
                    this.observedFileContents.set(fsPath, currentBytes);
                }
                return;
            }
            if (currentBytes && Buffer.compare(Buffer.from(previousObservedBytes), Buffer.from(currentBytes)) === 0) {
                return;
            }
        }

        if (!this.currentSession) {
            if (this.shouldTreatSaveRecoveryAsAi()) {
                await this.startAiSession();
            } else {
                await this.startManualSession();
            }
        }

        if (this.currentSession && !this.baselines.has(fsPath)) {
            if (mutation === 'created') {
                this.baselines.set(fsPath, new Uint8Array());
            } else if (previousObservedBytes !== undefined) {
                this.baselines.set(fsPath, previousObservedBytes);
            } else {
                if (currentBytes) {
                    this.observedFileContents.set(fsPath, currentBytes);
                }
                return;
            }
        }

        this.changedFiles.add(fsPath);
        this.currentTextCache.delete(fsPath);
        this.currentContentOverrides.set(fsPath, currentBytes);

        if (currentBytes) {
            this.observedFileContents.set(fsPath, currentBytes);
        } else {
            this.observedFileContents.delete(fsPath);
            this.lastObservedText.delete(fsPath);
        }

        console.log(`[SafetySessionCoordinator] tracked external file ${mutation}: ${fsPath}`);
        this.resetSessionTimer();
    }

    private isIgnoredPath(fsPath: string): boolean {
        const normalizedPath = fsPath.replace(/\\/g, '/');
        return (
            normalizedPath.includes('/.git/') ||
            normalizedPath.includes('/node_modules/') ||
            normalizedPath.includes('/dist/') ||
            normalizedPath.includes('/build/') ||
            normalizedPath.includes('/.gradle/') ||
            normalizedPath.includes('/target/') ||
            normalizedPath.includes('/out/') ||
            normalizedPath.includes('/.vscode/gitcat/')
        );
    }

    private shouldTreatSaveRecoveryAsAi(): boolean {
        const now = Date.now();
        return now - this.lastNonFileAiHintAt <= this.SAVE_RECOVERY_AI_HINT_WINDOW_MS;
    }

    private isAiBridgeScheme(scheme: string): boolean {
        return scheme.startsWith('chat-editing') || scheme === 'vscode-chat-code-block';
    }

    private async resetIfBranchChanged(): Promise<boolean> {
        if (!this.currentBranchResolver) {
            return false;
        }

        let resolvedBranch: string | null;
        try {
            resolvedBranch = await this.currentBranchResolver();
        } catch (error) {
            console.warn('[SafetySessionCoordinator] failed to resolve current branch:', error);
            return false;
        }

        const normalizedBranch = resolvedBranch?.trim() || null;
        if (this.lastKnownBranchName === null) {
            this.lastKnownBranchName = normalizedBranch;
            return false;
        }

        if (this.lastKnownBranchName === normalizedBranch) {
            return false;
        }

        console.log(
            `[SafetySessionCoordinator] branch changed: ${this.lastKnownBranchName ?? 'HEAD'} -> ${normalizedBranch ?? 'HEAD'}, resetting transient session state.`,
        );
        this.lastKnownBranchName = normalizedBranch;
        this.ignoreFilesystemEventsUntil = Date.now() + this.BRANCH_SWITCH_FILESYSTEM_COOLDOWN_MS;
        this.resetTransientStateForBranchSwitch();
        void this.warmWorkspaceFileState();
        return true;
    }

    private async isDirectoryUri(uri: vscode.Uri): Promise<boolean> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            return (stat.type & vscode.FileType.Directory) !== 0;
        } catch {
            return false;
        }
    }

    private resetTransientStateForBranchSwitch(): void {
        if (this.sessionTimer) {
            clearTimeout(this.sessionTimer);
            this.sessionTimer = null;
        }

        this.currentSession = null;
        this.baselines.clear();
        this.currentTextCache.clear();
        this.currentContentOverrides.clear();
        this.lastObservedText.clear();
        this.observedFileContents.clear();
        this.pendingSaveBaselines.clear();
        this.changedFiles.clear();
        this.dirtyFiles.clear();
        this.interSessionUserBaselines.clear();
        this.interSessionUserChangedFiles.clear();
        this.workspaceStateWarmupPromise = null;
    }
}
