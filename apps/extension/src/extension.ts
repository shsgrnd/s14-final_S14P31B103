import * as vscode from 'vscode';
import { GitCatDatabase, SecretManager } from '@gitcat/storage';
import { GitCatAIClient } from '@gitcat/ai-pipeline';

/**
 * GitCat 익스텐션의 메인 진입점(Entrypoint)입니다.
 * VS Code가 익스텐션을 활성화할 때 이 함수가 호출됩니다.
 * 
 * [주의사항]
 * 인프라 파트에서 기초적인 뼈대(인프라 모듈, 보안 래퍼)를 세팅하고
 * 기본 명령어 3가지를 등록해 두었습니다.
 * 프론트/백엔드 파트 개발자 분들은 이곳에서 필요한 모듈을 추가로 연결하시면 됩니다.
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('[GitCat] Extension activated');

  // 1. 워크스페이스 루트 경로 가져오기
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('GitCat requires an open workspace.');
    return;
  }

  // 2. 인프라 초기화: 로컬 SQLite 데이터베이스 연동
  const dbClient = new GitCatDatabase(workspaceRoot);
  const db = dbClient.getInstance();
  console.log('[GitCat] Database initialized');

  // 3. 인프라 초기화: 안전한 API Key 저장소 (SecretStorage 래퍼) 연동
  const secretManager = new SecretManager(context.secrets);

  // 4. 익스텐션 명령어 등록 (Command Palette 연동)
  
  // (1) 스냅샷 촬영 명령어 (백엔드 파트 담당)
  const cmdSnapshot = vscode.commands.registerCommand('gitcat.takeSnapshot', async () => {
    vscode.window.showInformationMessage('GitCat: 스냅샷을 촬영합니다... (백엔드 로직 연결 필요)');
    // TODO: 백엔드 담당자님, 이곳에서 git-core 모듈을 호출해 스냅샷을 진행해 주세요.
  });

  // (2) 병합 충돌 분석 명령어 (AI/웹뷰 파트 담당)
  const cmdAnalyze = vscode.commands.registerCommand('gitcat.analyzeConflict', async () => {
    vscode.window.showInformationMessage('GitCat: 충돌 분석을 시작합니다... (AI 로직 연결 필요)');
    
    // 예시: 저장된 API 키를 가져와서 AI 클라이언트에 주입
    const apiKey = await secretManager.getApiKey();
    if (!apiKey) {
      vscode.window.showErrorMessage('API Key가 설정되지 않았습니다. 명령 팔레트에서 Set API Key를 실행하세요.');
      return;
    }
    const aiClient = new GitCatAIClient(apiKey);
    // TODO: AI 담당자님, 이곳에서 aiClient.callModel() 등을 호출해 주세요.
  });

  // (3) API Key 설정 명령어 (인프라 파트 제공)
  const cmdSetApiKey = vscode.commands.registerCommand('gitcat.setApiKey', async () => {
    const input = await vscode.window.showInputBox({
      prompt: 'OpenAI API Key를 입력하세요 (안전하게 로컬에 암호화되어 저장됩니다)',
      password: true, // 입력값 마스킹
    });

    if (input) {
      await secretManager.setApiKey(input);
      vscode.window.showInformationMessage('GitCat: API Key가 성공적으로 저장되었습니다!');
    }
  });

  // 컨텍스트에 명령어 등록 (익스텐션 종료 시 자동 해제되도록)
  context.subscriptions.push(cmdSnapshot, cmdAnalyze, cmdSetApiKey);
}

/**
 * 익스텐션이 비활성화될 때 호출되는 함수입니다.
 */
export function deactivate() {
  console.log('[GitCat] Extension deactivated');
}
