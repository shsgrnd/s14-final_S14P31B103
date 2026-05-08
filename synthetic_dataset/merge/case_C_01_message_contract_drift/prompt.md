당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 문맥에 맞게 안전하게 중재한 결과를 JSON 형식으로 반환해 주세요.

<<<<<<< HEAD
// packages/shared-types/src/dto/message.ts
export interface WebviewMessage {
  command: string;
  data?: any;
}
=======
// packages/shared-types/src/dto/message.ts
export interface WebviewMessage {
  type: string;
  payload: Record<string, unknown>;
}
>>>>>>> feature/strict-message-types
