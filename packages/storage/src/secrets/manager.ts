/**
 * VS Code ExtensionContext.secrets와 동일한 인터페이스 규격입니다.
 * @gitcat/storage 패키지는 순수 Node 환경에서도 테스트할 수 있도록
 * vscode에 직접 의존하지 않고 인터페이스(Duck Typing)로 주입받습니다.
 */
export interface ISecretStorage {
  get(key: string): PromiseLike<string | undefined> | Promise<string | undefined>;
  store(key: string, value: string): PromiseLike<void> | Promise<void>;
  delete(key: string): PromiseLike<void> | Promise<void>;
}

/**
 * GitCat 보안 스토리지(Secret Storage) 관리자입니다.
 * 평문으로 저장하면 안 되는 민감한 API Key 등을 VS Code의 안전한 저장소에 보관합니다.
 * 
 * [주의사항]
 * 인프라 파트에서 `apps/extension/src/extension.ts`의 `activate` 함수가 실행될 때,
 * `vscode.ExtensionContext.secrets` 객체를 이 클래스의 생성자로 넘겨주어야 합니다.
 * 
 * @example
 * // 익스텐션 진입점에서 초기화할 때
 * const secretManager = new SecretManager(context.secrets);
 * await secretManager.setApiKey('sk-xxxxxx...');
 * 
 * // AI 파트에서 토큰을 꺼내 쓸 때
 * const apiKey = await secretManager.getApiKey();
 */
export class SecretManager {
  private static readonly API_KEY_NAME = 'gitcat:secret:aiApiKey';
  private storage: ISecretStorage;

  /**
   * @param storage VS Code의 ExtensionContext.secrets 객체
   */
  constructor(storage: ISecretStorage) {
    this.storage = storage;
  }

  /**
   * 외부 LLM(OpenAI 등) API Key를 안전하게 저장합니다.
   * 기존 값이 있다면 덮어씁니다.
   * 
   * @param token 사용자가 입력한 API Key 문자열
   */
  public async setApiKey(token: string): Promise<void> {
    await this.storage.store(SecretManager.API_KEY_NAME, token);
  }

  /**
   * 저장된 API Key를 가져옵니다.
   * AI 파트 담당자는 AI 모델을 호출하기 직전에 이 함수를 통해 Key를 조회해야 합니다.
   * 
   * @returns 저장된 API Key (없으면 undefined 반환)
   */
  public async getApiKey(): Promise<string | undefined> {
    return await this.storage.get(SecretManager.API_KEY_NAME);
  }

  /**
   * 저장된 API Key를 안전하게 삭제합니다.
   * (사용자가 로그아웃하거나 연동을 해제할 때 호출)
   */
  public async deleteApiKey(): Promise<void> {
    await this.storage.delete(SecretManager.API_KEY_NAME);
  }
}
