import * as vscode from 'vscode';

const AI_API_KEY_SECRET_KEY = 'gitcat.ai.apiKey';

/**
 * AI 추천 기능에서 사용할 API Key 조회 및 관리를 담당하는 서비스.
 * 나중에 로컬 AI 모델로 전환 시 이 서비스의 구현만 교체하거나 비활성화할 수 있습니다.
 */
export class AiSecretService {
  constructor(private readonly secretStorage: vscode.SecretStorage) {}

  /**
   * AI API Key를 조회합니다.
   * 조회 순서:
   * 1. process.env.GMS_KEY (.env 파일 등에서 로드된 값 우선 사용)
   * 2. VS Code SecretStorage에 저장된 값
   * 3. 둘 다 없으면 사용자에게 입력을 요청 (취소 시 에러 발생)
   */
  async getApiKey(): Promise<string> {
    // 1. .env 환경변수 확인 (기존 호환성 유지)
    if (process.env.GMS_KEY) {
      return process.env.GMS_KEY;
    }

    // 2. SecretStorage 확인
    let apiKey = await this.secretStorage.get(AI_API_KEY_SECRET_KEY);
    if (apiKey) {
      return apiKey;
    }

    // 3. 사용자 입력 요청
    apiKey = await vscode.window.showInputBox({
      prompt: 'GitCat AI 추천에 사용할 API Key를 입력해주세요. (입력한 키는 암호화되어 로컬에 저장됩니다)',
      placeHolder: 'API Key 입력...',
      password: true,
      ignoreFocusOut: true,
    });

    if (!apiKey) {
      throw new Error('AI API Key 입력이 취소되어 추천을 진행할 수 없습니다.');
    }

    // 4. 입력받은 키를 SecretStorage에 안전하게 저장
    await this.secretStorage.store(AI_API_KEY_SECRET_KEY, apiKey);
    
    return apiKey;
  }

  /**
   * 저장된 API Key를 삭제합니다.
   */
  async deleteApiKey(): Promise<void> {
    await this.secretStorage.delete(AI_API_KEY_SECRET_KEY);
  }
}
