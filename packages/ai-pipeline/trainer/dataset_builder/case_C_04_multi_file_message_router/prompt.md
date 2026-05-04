당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래 여러 파일에 걸쳐 발생한 충돌을 분석하고, 문맥에 맞게 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

--- FILE: packages/extension/src/router/MessageRouter.ts ---
<<<<<<< HEAD
export function routeMessage(message: WebviewMessage): void {
  switch (message.command) {
    case 'requestRecommendation':
      handleRecommendation(message.data);
      break;
    default:
      console.warn('Unknown command:', message.command);
  }
}
=======
export function routeMessage(message: WebviewMessage): void {
  switch (message.type) {
    case 'REQUEST_RECOMMENDATION':
      handleRecommendation(message.payload);
      break;
    default:
      console.warn('Unknown type:', message.type);
  }
}
>>>>>>> feature/strict-message-types

--- FILE: packages/ai-pipeline/src/recommendation/RecommendationHandler.ts ---
<<<<<<< HEAD
export async function handleRecommendation(data: any): Promise<void> {
  const result = await generateRecommendation(data);
  postMessageToWebview({ command: 'recommendationResult', data: result });
}
=======
export async function handleRecommendation(payload: Record<string, unknown>): Promise<void> {
  const result = await generateRecommendation(payload);
  postMessageToWebview({ type: 'RECOMMENDATION_RESULT', payload: result });
}
>>>>>>> feature/strict-message-types
