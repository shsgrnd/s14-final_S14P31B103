import OpenAI from 'openai';

/**
 * GitCat AI 통신 클라이언트입니다.
 * 이 클래스는 인프라 파트에서 주입해주는 API Key를 바탕으로 OpenAI API와 통신합니다.
 * 
 * [주의사항]
 * 남주완 담당자님: 이곳에서 OpenAI 라이브러리를 활용해 모델 호출, 재시도(Retry), 에러 핸들링을 구현하시면 됩니다.
 * 
 * @example
 * const aiClient = new GitCatAIClient(apiKey);
 * const response = await aiClient.generateMergeDraft(payload);
 */
export class GitCatAIClient {
  private openai: OpenAI;

  /**
   * @param apiKey SecretManager를 통해 가져온 사용자 API Key
   */
  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * (임시 예시) AI에게 프롬프트를 보내고 응답을 받아옵니다.
   * 실제 구현 시에는 남주완 담당자님이 정의된 인터페이스 규격(model_call_request 등)에 맞게
   * 파라미터와 리턴 타입을 수정해 주시면 됩니다.
   * 
   * @param promptSystem 시스템 프롬프트 (템플릿에서 생성됨)
   * @param promptUser 사용자 프롬프트 (페이로드 기반)
   */
  public async callModel(promptSystem: string, promptUser: string): Promise<string | null> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview", // 임시 모델명
        messages: [
          { role: "system", content: promptSystem },
          { role: "user", content: promptUser }
        ],
        temperature: 0.2, // 환각(Hallucination) 방지를 위해 낮게 설정
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("[GitCat AI Error]", error);
      throw error;
    }
  }
}
