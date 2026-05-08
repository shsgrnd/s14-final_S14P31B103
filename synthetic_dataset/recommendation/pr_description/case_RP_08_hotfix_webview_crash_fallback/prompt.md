당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 PR 제목과 본문을 함께 담은 markdown 추천을 JSON 형식으로 반환해 주세요.

Project ID: proj_gitcat_rec_28
Feature Type: recommendation
Recommendation Type: pr_description
Current Branch: fix/extension/webview-crash-fallback/S14P31B103-208
Change Summary: recommendation payload가 비어 있을 때 Webview가 null 접근으로 죽는 문제를 fallback과 guard로 막았다.
Changed Files: apps/extension/src/features/recommendation/PrRecommendationHandler.ts, apps/webview-ui/src/components/merge/ConflictAnalysisView.tsx
Work Intent: Webview 크래시 hotfix 범위와 확인 포인트가 보이는 PR 설명이 필요하다.
Diff Summary: empty payload guard, fallback rendering, error notice handling
Branch Context: Base branch develop, extension-webview boundary bug
Message Constraints: title should mention crash or fallback, keep body actionable
Ticket Ref: S14P31B103-208
