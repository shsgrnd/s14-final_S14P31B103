당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 PR 제목과 본문을 함께 담은 markdown 추천을 JSON 형식으로 반환해 주세요.

Project ID: proj_gitcat_rec_24
Feature Type: recommendation
Recommendation Type: pr_description
Current Branch: feat/extension/recommendation-flow-cleanup/S14P31B103-204
Change Summary: 추천 결과 복사, message shape 통일, fallback 문구 수정, 불필요한 로그 제거가 섞여 있다.
Changed Files: apps/extension/src/features/recommendation/BranchRecommendationMessageHandler.ts, apps/extension/src/features/git/GitMessageHandler.ts, apps/webview-ui/src/components/merge/MediationCard.tsx
Work Intent: recommendation flow 정리와 UX polish라는 공통 맥락으로 PR 설명을 만들고 싶다.
Diff Summary: message payload cleanup, copy tweaks, fallback handling, console cleanup
Branch Context: Base branch develop, mixed changes but same user flow
Message Constraints: emphasize user flow, keep title broad enough
Ticket Ref: S14P31B103-204
