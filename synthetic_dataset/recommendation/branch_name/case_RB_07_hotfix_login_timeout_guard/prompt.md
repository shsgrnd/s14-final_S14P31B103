당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 저장소 작업 맥락을 바탕으로 팀 Git 컨벤션에 맞는 브랜치명을 JSON 형식으로 추천해 주세요.

Project ID: proj_gitcat_rec_07
Feature Type: recommendation
Recommendation Type: branch_name
Current Branch: patch/login-fail
Workspace Summary: 로그인 요청이 느린 네트워크에서 timeout 후 중복 상태 갱신을 일으켜 화면이 멈춘다.
Work Intent: 긴급 수정임이 드러나는 브랜치명이 필요하다.
Branch Context: extension 로그인 진입부와 request cancellation guard를 빠르게 고친다.
Existing Branches: fix/fe/login-token-refresh/S14P31B103-152, feat/fe/auth-error-banner/S14P31B103-191
Ticket Ref: S14P31B103-207
Naming Constraints: use fix type, mention timeout guard, keep scope concise
