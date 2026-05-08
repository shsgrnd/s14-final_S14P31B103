당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 저장소 작업 맥락을 바탕으로 팀 Git 컨벤션에 맞는 브랜치명을 JSON 형식으로 추천해 주세요.

Project ID: proj_gitcat_rec_08
Feature Type: recommendation
Recommendation Type: branch_name
Current Branch: urgent/webview
Workspace Summary: 추천 결과 payload가 비어 있을 때 Webview가 null 접근으로 즉시 크래시한다.
Work Intent: fallback 추가와 null guard 중심의 긴급 수정 브랜치명이 필요하다.
Branch Context: extension message handler와 webview renderer 둘 다 수정된다.
Existing Branches: fix/extension/panel-loading-state/S14P31B103-166, feat/webview/rich-result-card/S14P31B103-194
Ticket Ref: S14P31B103-208
Naming Constraints: use fix type, prefer crash or fallback wording over generic bugfix
