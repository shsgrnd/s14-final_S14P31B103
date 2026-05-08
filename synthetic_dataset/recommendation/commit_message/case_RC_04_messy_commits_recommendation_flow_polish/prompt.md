당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 팀 컨벤션에 맞는 커밋 메시지를 JSON 형식으로 추천해 주세요.

Project ID: proj_gitcat_rec_14
Feature Type: recommendation
Recommendation Type: commit_message
Current Branch: feat/extension/recommendation-flow-cleanup/S14P31B103-204
Change Summary: 추천 결과 복사 버튼 정리, Webview message shape 통일, fallback 문구 보정, 죽은 console.log 제거가 섞여 있다.
Changed Files: apps/extension/src/features/recommendation/BranchRecommendationMessageHandler.ts, apps/extension/src/features/git/GitMessageHandler.ts, apps/webview-ui/src/components/merge/MediationCard.tsx
Work Intent: recommendation flow 전반의 UX와 계약 정리를 한 번에 설명하는 메시지가 필요하다.
Diff Summary: message payload cleanup, UI copy tweaks, fallback handling, log removal
Branch Context: 사용성 polish이지만 message contract 정리도 포함된다.
Message Constraints: conventional-commit, imperative, prefer flow or contract wording
Ticket Ref: S14P31B103-204
