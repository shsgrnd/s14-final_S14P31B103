import * as vscode from 'vscode';
import { IMessage } from '../core/types';

export class MessageRouter {
    static async route(message: IMessage, webview: vscode.Webview) {
        console.log(`[GitCat] Received message: ${message.type}`);

        try {
            switch (message.type) {
                // I-01-GET_SNAPSHOT_LIST 예시
                case 'I-01-GET_SNAPSHOT_LIST':
                    // SnapshotManager 호출
                    webview.postMessage({
                        type: 'I-02-SNAPSHOT_LIST',
                        payload: { snapshots: [] }
                    });
                    break;

                // 기타 I-01-* 메시지 라우팅
                default:
                    console.warn(`[GitCat] Unhandled message type: ${message.type}`);
                    webview.postMessage({
                        type: 'I-02-ERROR',
                        payload: { message: `Unhandled type: ${message.type}` }
                    });
            }
        } catch (error: any) {
            webview.postMessage({
                type: 'I-02-ERROR',
                payload: { message: error.message }
            });
        }
    }
}
