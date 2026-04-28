import * as vscode from 'vscode';
import { InboundMessage, OutboundMessage, InboundMessageType } from '@gitcat/shared-types';

export class MessageRouter {
    constructor(private readonly dbInstance: any) { }

    public async route(message: InboundMessage, webview: vscode.Webview) {
        console.log(`[GitCat] Received message: ${message.type}`, message.payload);

        try {
            switch (message.type) {
                // 스냅샷 관련
                case 'GET_SNAPSHOT_LIST':
                    await this.handleGetSnapshotList(webview);
                    break;
                case 'CREATE_SNAPSHOT':
                    await this.handleCreateSnapshot(message.payload, webview);
                    break;
                case 'DELETE_SNAPSHOT':
                    await this.handleSimpleAction(message.type, `스냅샷 삭제: ${message.payload.snapshotId}`);
                    break;
                case 'RESTORE_SNAPSHOT':
                    await this.handleSimpleAction(message.type, `스냅샷 복원: ${message.payload.snapshotId}`);
                    break;
                case 'RENAME_SNAPSHOT':
                    await this.handleSimpleAction(message.type, `스냅샷 이름 변경: ${message.payload.newTitle}`);
                    break;
                case 'TOGGLE_SNAPSHOT_STAR':
                    await this.handleSimpleAction(message.type, `스냅샷 즐겨찾기 토글: ${message.payload.snapshotId}`);
                    break;
                case 'GET_SNAPSHOT_FILES':
                    await this.handleSimpleAction(message.type, `스냅샷 파일 목록 조회: ${message.payload.snapshotId}`);
                    break;

                // 브랜치 관련
                case 'GET_BRANCH_LIST':
                    await this.handleGetBranchList(webview);
                    break;
                case 'CHECKOUT_BRANCH':
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

                // AI 및 병합 관련
                case 'OPEN_MERGE_PANEL':
                    await this.handleSimpleAction(message.type, '병합 패널 열기');
                    break;
                case 'ANALYZE_CONFLICT':
                    await this.handleSimpleAction(message.type, `충돌 분석 시작: ${message.payload.source} -> ${message.payload.target}`);
                    break;
                case 'ACCEPT_MERGE':
                    await this.handleSimpleAction(message.type, `AI 병합 중재안 수락: ${message.payload.filePath}`);
                    break;
                case 'REJECT_MERGE':
                    await this.handleSimpleAction(message.type, `AI 병합 중재안 거절: ${message.payload.filePath}`);
                    break;
                case 'RUN_MERGE':
                    await this.handleSimpleAction(message.type, `병합 실행: ${message.payload.source} -> ${message.payload.target}`);
                    break;
                case 'GET_AI_DRAFT':
                    await this.handleSimpleAction(message.type, `AI 초안 조회: ${message.payload.filePath}`);
                    break;
                case 'REJECT_AI_DRAFT':
                    await this.handleSimpleAction(message.type, `AI 초안 삭제: ${message.payload.id}`);
                    break;
                case 'RECOMMEND_COMMIT':
                    await this.handleSimpleAction(message.type, '커밋 메시지 추천 요청');
                    break;
                case 'RECOMMEND_BRANCH':
                    await this.handleSimpleAction(message.type, `브랜치명 추천 요청: ${message.payload.purpose}`);
                    break;
                case 'RECOMMEND_PR':
                    await this.handleSimpleAction(message.type, `PR 본문 추천 요청 (base: ${message.payload.base})`);
                    break;
                case 'APPLY_COMMIT':
                    await this.handleSimpleAction(message.type, `추천 커밋 메시지 적용: ${message.payload.message}`);
                    break;
                case 'SET_CHECKPOINT':
                    await this.handleSimpleAction(message.type, `체크포인트 설정: ${message.payload.snapshotId}`);
                    break;

                // 유틸리티 및 기타
                case 'OPEN_FILE_DIFF':
                    await this.handleOpenFileDiff(message.payload);
                    break;
                case 'OPEN_DIFF_EDITOR':
                    await this.handleSimpleAction(message.type, `Diff 에디터 열기: ${message.payload.filePath}`);
                    break;
                case 'SET_CONFIG':
                    await this.handleSimpleAction(message.type, '설정 변경');
                    break;

                default:
                    console.warn(`[GitCat] Unhandled message type: ${message.type}`);
                    this.postError(webview, `Unhandled type: ${message.type}`);
            }
        } catch (error: any) {
            console.error(`[GitCat] Error handling message ${message.type}:`, error);
            this.postError(webview, error.message);
        }
    }

    private async handleGetSnapshotList(webview: vscode.Webview) {
        // 실제 DB에서 스냅샷 목록 조회
        // 현재는 Mock 데이터 반환
        webview.postMessage({
            type: 'SNAPSHOT_LIST',
            payload: { snapshots: [] }
        });
    }

    private async handleGetBranchList(webview: vscode.Webview) {
        // 실제 브랜치 목록 조회
        webview.postMessage({
            type: 'BRANCH_LIST',
            payload: { branches: [] }
        });
    }

    private async handleRefreshStatus(webview: vscode.Webview) {
        // Git 상태 갱신
        webview.postMessage({
            type: 'GIT_STATUS_UPDATED',
            payload: { status: {} }
        });
    }

    private async handleCreateSnapshot(payload: any, webview: vscode.Webview) {
        // 스냅샷 생성 로직
        vscode.window.showInformationMessage(`GitCat: 스냅샷 생성 요청됨 - ${payload.title}`);
    }

    private async handleOpenFileDiff(payload: any) {
        // 파일 Diff 에디터 열기
        vscode.window.showInformationMessage(`GitCat: 파일 비교 요청됨 - ${payload.filePath}`);
    }

    private async handleSimpleAction(type: string, logMessage: string) {
        console.log(`[GitCat] Action triggered: ${type} - ${logMessage}`);
        vscode.window.showInformationMessage(`GitCat: ${logMessage}`);
    }

    private postError(webview: vscode.Webview, message: string) {
        webview.postMessage({
            type: 'ERROR',
            payload: { code: 'INTERNAL_ERROR', message }
        });
    }
}
