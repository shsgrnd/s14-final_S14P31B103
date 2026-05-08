당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 충돌 원인을 JSON 형식으로 설명해 주세요.

<<<<<<< HEAD
// packages/ai-pipeline/src/provider/AiClient.ts
async callWithRetry(prompt: string): Promise<string> {
  for (let i = 0; i < 3; i++) {
    try {
      return await this.call(prompt);
    } catch (e) {
      if (i === 2) throw e;
      await sleep(1000 * (i + 1));
    }
  }
  throw new Error('unreachable');
}
=======
// packages/ai-pipeline/src/provider/AiClient.ts
async callWithRetry(prompt: string): Promise<string> {
  const timeout = 5000;
  return Promise.race([
    this.call(prompt),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI call timeout')), timeout)
    ),
  ]);
}
>>>>>>> feature/timeout-guard
