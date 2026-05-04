당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 문맥에 맞게 안전하게 중재한 결과를 JSON 형식으로 반환해 주세요.

<<<<<<< HEAD
// packages/ai-pipeline/src/provider/AiClient.ts
async call(prompt: string): Promise<string> {
  try {
    const response = await this.client.chat(prompt);
    return response.text;
  } catch (e) {
    console.error('[AiClient] 호출 실패, fallback 빈 문자열 반환:', e);
    return '';
  }
}
=======
// packages/ai-pipeline/src/provider/AiClient.ts
async call(prompt: string): Promise<string> {
  const response = await this.client.chat(prompt);
  return response.text;
}
>>>>>>> feature/remove-silent-fallback
