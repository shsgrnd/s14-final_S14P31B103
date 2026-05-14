import * as vscode from 'vscode';
import {
  AnalyzeConflictRequestSchema,
  type OutboundMessage,
} from '@gitcat/shared-types';
import { MergeConflictAnalysisService } from './MergeConflictAnalysisService';

/**
 * 병합 충돌 분석 Webview 메시지를 처리합니다.
 *
 * RUN_MERGE 흐름은 기존 GitMessageHandler에 남기고, ANALYZE_CONFLICT만 전용 서비스로 위임합니다.
 */
export class MergeConflictMessageHandler {
  constructor(private readonly service: MergeConflictAnalysisService) {}

  async handle(type: string, payload: unknown, webview: vscode.Webview): Promise<boolean> {
    if (type !== 'ANALYZE_CONFLICT') {
      return false;
    }

    webview.postMessage({ type: 'LOADING', payload: { target: 'mergeAnalysis', loading: true } });
    try {
      const request = AnalyzeConflictRequestSchema.parse(payload);
      const result = await this.service.analyze(request);

      webview.postMessage({
        type: 'CONFLICT_RESULT',
        payload: {
          analysisId: result.analysisId,
          artifactPath: result.artifactPath,
          candidates: result.candidates,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      webview.postMessage({
        type: 'ERROR',
        payload: {
          code: 'INTERNAL_ERROR',
          message,
        },
      } as OutboundMessage);
    } finally {
      webview.postMessage({ type: 'LOADING', payload: { target: 'mergeAnalysis', loading: false } });
    }

    return true;
  }
}
