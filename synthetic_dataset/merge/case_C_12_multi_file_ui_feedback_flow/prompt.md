당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래 여러 파일에 걸쳐 발생한 충돌을 분석하고, 문맥에 맞게 안전하게 중재한 결과를 JSON 형식으로 반환해 주세요.

--- FILE: packages/extension/src/webview/RecommendPanel.ts ---
<<<<<<< HEAD
private postResult(result: RecommendationResult): void {
  this._panel.webview.postMessage({
    command: 'showResult',
    data: { primary: result.primary_text },
  });
}
=======
private postResult(result: RecommendationResult): void {
  this._panel.webview.postMessage({
    type: 'SHOW_RESULT',
    payload: {
      primary: result.primary_text,
      alternatives: result.alternative_texts,
      confidence: result.confidence_score,
    },
  });
}
>>>>>>> feature/rich-result-payload

--- FILE: packages/ai-pipeline/src/recommendation/RecommendationService.ts ---
<<<<<<< HEAD
export async function generateRecommendation(
  input: RecommendationInput
): Promise<{ primary_text: string }> {
  const result = await aiClient.call(buildPrompt(input));
  return { primary_text: parseResult(result) };
}
=======
export async function generateRecommendation(
  input: RecommendationInput
): Promise<RecommendationResult> {
  const rawResult = await aiClient.call(buildPrompt(input));
  return parseFullResult(rawResult);
}
>>>>>>> feature/rich-result-payload
