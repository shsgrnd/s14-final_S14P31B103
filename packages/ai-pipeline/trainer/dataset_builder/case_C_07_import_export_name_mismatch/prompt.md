당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 충돌 원인을 JSON 형식으로 설명해 주세요.

<<<<<<< HEAD
// packages/extension/src/index.ts
import { RecommendationResult } from '@gitcat/shared-types/recommendation';

export function activate(context: vscode.ExtensionContext) {
  const result: RecommendationResult = await requestRecommendation();
}
=======
// packages/extension/src/index.ts
import { RecommendResult } from '@gitcat/shared-types';

export function activate(context: vscode.ExtensionContext) {
  const result: RecommendResult = await requestRecommendation();
}
>>>>>>> feature/refactor-shared-types-exports
