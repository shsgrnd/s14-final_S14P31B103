import * as vscode from 'vscode';
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
    constructor(private readonly dbInstance: any) { }

    /**
     * 메시지를 수신하여 검증하고 적절한 처리를 수행합니다.
     */
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
            switch (message.type) {
                // 스냅샷 관련
                case 'GET_SNAPSHOT_LIST':
                    await this.handleGetSnapshotList(webview);
                    break;
                case 'CREATE_SNAPSHOT':
                    await this.handleCreateSnapshot(message.payload, webview);
                    break;
                
                // 브랜치 관련
                case 'GET_BRANCH_LIST':
                    await this.handleGetBranchList(webview);
                    break;
                case 'CHECKOUT_BRANCH':
                    // TODO: GitCommandHandler 연동
                    await this.handleSimpleAction(message.type, `브랜치 체크아웃: ${message.payload.name}`);
                    break;
                case 'APPLY_BRANCH':
                    await this.handleSimpleAction(message.type, `브랜치 생성/적용: ${message.payload.name}`);
                    break;
                case 'DELETE_BRANCHES':
                    await this.handleSimpleAction(message.type, `브랜치 삭제: ${message.payload.names.join(', ')}`);
                    break;

                // Git 작업 관련
                case 'REFRESH_STATUS':
                    await this.handleRefreshStatus(webview);
                    break;
                case 'GIT_ADD_ALL':
                    await this.handleSimpleAction(message.type, '모든 변경사항 스테이징 (git add .)');
                    break;
                case 'EXECUTE_COMMIT':
                    await this.handleSimpleAction(message.type, `커밋 실행: ${message.payload.message}`);
                    break;
                case 'GIT_PUSH':
                    await this.handleSimpleAction(message.type, 'Push 실행');
                    break;
                case 'EXECUTE_PULL':
                    await this.handleSimpleAction(message.type, 'Pull 실행');
                    break;

                // 유틸리티
                case 'OPEN_FILE_DIFF':
                    await this.handleOpenFileDiff(message.payload);
                    break;

                default:
                    // 정의는 되어 있으나 아직 구현되지 않은 타입들
                    await this.handleSimpleAction(message.type, `미구현 액션: ${message.type}`);
                    break;
            }
        } catch (error: any) {
            console.error(`[GitCat] Error processing ${message.type}:`, error);
            this.postError(webview, 'INTERNAL_ERROR', error.message);
        }
    }

    private async handleGetSnapshotList(webview: vscode.Webview) {
        // 실제 구현 시 SnapshotRepository 연동
        webview.postMessage({
            type: 'SNAPSHOT_LIST',
            payload: { snapshots: [] }
        } as OutboundMessage);
    }

    private async handleGetBranchList(webview: vscode.Webview) {
        // 실제 구현 시 BranchRepository/GitClient 연동
        webview.postMessage({
            type: 'BRANCH_LIST',
            payload: { branches: [] }
        } as OutboundMessage);
    }

    private async handleRefreshStatus(webview: vscode.Webview) {
        // Git 상태 조회 (Mock 데이터)
        webview.postMessage({
            type: 'GIT_STATUS_UPDATED',
            payload: {
                status: {
                    branch: 'main',
                    isMergeInProgress: false,
                    staged: [],
                    unstaged: [],
                    untracked: [],
                    conflicted: []
                }
            }
        } as OutboundMessage);
    }

    private async handleCreateSnapshot(payload: any, webview: vscode.Webview) {
        vscode.window.showInformationMessage(`GitCat: 스냅샷 생성 요청됨 - ${payload.title}`);
    }

    private async handleOpenFileDiff(payload: any) {
        vscode.window.showInformationMessage(`GitCat: 파일 비교 요청됨 - ${payload.filePath}`);
    }

    private async handleSimpleAction(type: string, logMessage: string) {
        console.log(`[GitCat] Action: ${type} - ${logMessage}`);
        vscode.window.showInformationMessage(`GitCat: ${logMessage}`);
    }

    private postError(webview: vscode.Webview, code: ErrorCode, message: string) {
        webview.postMessage({
            type: 'ERROR',
            payload: { code, message }
        } as OutboundMessage);
    }
}
