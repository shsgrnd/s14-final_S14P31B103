당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 팀 컨벤션에 맞는 커밋 메시지를 JSON 형식으로 추천해 주세요.

Project ID: proj_gitcat_rec_18
Feature Type: recommendation
Recommendation Type: commit_message
Current Branch: fix/extension/webview-crash-fallback/S14P31B103-208
Change Summary: recommendation payload가 없을 때 Webview가 null 접근으로 죽는 문제를 막기 위해 fallback과 guard를 추가했다.
Changed Files: apps/extension/src/features/recommendation/PrRecommendationHandler.ts, apps/webview-ui/src/components/merge/ConflictAnalysisView.tsx
Work Intent: Webview 크래시 방지와 fallback 추가 의도가 드러나는 메시지가 필요하다.
Diff Summary: null guard, empty payload fallback, error notice rendering
Branch Context: extension-webview 경계에서 발생하는 사용자 장애 수정이다.
Message Constraints: conventional-commit, imperative, use fix type
Ticket Ref: S14P31B103-208
