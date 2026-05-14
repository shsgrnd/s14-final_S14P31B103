import * as vscode from 'vscode';
import { SessionType, SessionMeta } from '@gitcat/shared-types';
import { AiChangeDetector } from './AiChangeDetector';
import { ISnapshotService } from '../snapshot/ISnapshotService';

export class SafetySessionCoordinator {
    private currentSession: SessionMeta | null = null;
    private baselines = new Map<string, string>(); // AI 세션 내 filePath → 변경 전 원본
    private currentTextCache = new Map<string, string>(); // filePath → 최신 텍스트
    private changedFiles = new Set<string>(); // AI 세션 내 변경 파일 경로
    private dirtyFiles = new Set<string>(); // 현재 저장되지 않은 변경이 있는 파일 경로
    private aiChangeDetector = new AiChangeDetector();

    /**
     * AI 세션 사이 사용자가 변경한 파일 추적
     * - 이전 AI 세션 종료 후 사용자가 처음 편집할 때 디스크 내용을 baseline으로 캡처
     * - AI 세션 시작 시 user_patch.diff 생성에 사용 후 초기화
     */
    private interSessionUserBaselines = new Map<string, string>();
    private interSessionUserChangedFiles = new Set<string>();

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

        // AI 세션 시작 전: 세션 간 사용자 변경분이 있으면 auto_dirty_before_ai 스냅샷 생성
        if (type === 'ai' && this.interSessionUserChangedFiles.size > 0) {
            await this.snapshotService.createSnapshot('auto_dirty_before_ai', {
                reason: 'AI 작업 시작 전 사용자 변경분 저장 (user_patch.diff)',
                changedFiles: Array.from(this.interSessionUserChangedFiles),
                // user_patch.diff 생성용: AI 세션 간 사용자가 편집하기 직전 상태
                userBaselines: new Map(this.interSessionUserBaselines),
                userChangedFiles: Array.from(this.interSessionUserChangedFiles),
            });
            // 전달 후 초기화
            this.interSessionUserBaselines.clear();
            this.interSessionUserChangedFiles.clear();
        } else if (type === 'ai' && this.dirtyFiles.size > 0) {
            // 이전 AI 세션 추적 없이도 dirty 파일이 있으면 저장 (초기 실행 케이스)
            await this.snapshotService.createSnapshot('auto_dirty_before_ai', {
                reason: 'AI 작업 시작 전 더티 상태 스냅샷 자동 생성',
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

        // 세션 종료 후 결과 스냅샷 생성
        const snapshotType = endedSession.type === 'ai' ? 'ai_result' : 'manual_edit_result';
        await this.snapshotService.createSnapshot(snapshotType, {
            sessionId: endedSession.sessionId,
            reason: reason || '세션 종료 (유휴 상태 도달)',
            changedFiles: Array.from(this.changedFiles),
            baselines: new Map(this.baselines),
        });

        // AI 세션이 끝났으면 현재 시점을 interSession baseline으로 캡처
        // 이후 사용자가 편집 시 이 상태 대비 user_patch.diff를 생성한다
        if (endedSession.type === 'ai') {
            // changedFiles를 interSession baseline에 미리 등록
            // (현재 디스크 상태 = AI 작업 결과물 → 다음 user diff의 "before" 기준)
            for (const [filePath, _] of this.baselines) {
                if (!this.interSessionUserBaselines.has(filePath)) {
                    // AI 세션 시작 시점 baseline을 interSession에도 기록
                    // 실제 AI 결과물은 나중에 onDidSaveTextDocument 등에서 갱신됨
                    this.interSessionUserBaselines.set(filePath, this.currentTextCache.get(filePath) ?? '');
                }
            }
        }

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
        // [DEBUG] 함수 진입 확인 - 이 로그가 안 보이면 이벤트 연결 자체가 안 된 것
        console.log(`[DEBUG] handleDocumentChange called: scheme=${doc.uri.scheme}, changes=${event.contentChanges.length}`);

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
            if (!this.currentSession) {
                // interSession baseline 캡처 (세션 시작 전 콜스액 상태 기록)
                this.interSessionUserChangedFiles.add(fsPath);
                if (!this.interSessionUserBaselines.has(fsPath)) {
                    try {
                        const fileData = await vscode.workspace.fs.readFile(doc.uri);
                        this.interSessionUserBaselines.set(fsPath, Buffer.from(fileData).toString('utf8'));
                    } catch {
                        this.interSessionUserBaselines.set(fsPath, '');
                    }
                }
                // readFile 대기 중 다른 이벤트가 먼저 세션을 시작했을 수 있으므로 재확인
                if (!this.currentSession) {
                    await this.startManualSession();
                }
            }
            // manual 세션 중 or AI 세션 중: 아래 changedFiles에 추가됨
        }

        this.changedFiles.add(fsPath);
        this.currentTextCache.set(fsPath, doc.getText());

        if (doc.isDirty) {
            this.dirtyFiles.add(fsPath);
        } else {
            this.dirtyFiles.delete(fsPath);
        }

        // Baseline 저장 (해당 세션 내에서 파일별로 최초 1회만)
        if (this.currentSession && !this.baselines.has(fsPath)) {
            try {
                const fileData = await vscode.workspace.fs.readFile(doc.uri);
                this.baselines.set(fsPath, Buffer.from(fileData).toString('utf8'));
            } catch {
                this.baselines.set(fsPath, '');
            }
        }

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
