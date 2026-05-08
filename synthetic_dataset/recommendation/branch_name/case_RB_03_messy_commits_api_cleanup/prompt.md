당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 저장소 작업 맥락을 바탕으로 팀 Git 컨벤션에 맞는 브랜치명을 JSON 형식으로 추천해 주세요.

Project ID: proj_gitcat_rec_03
Feature Type: recommendation
Recommendation Type: branch_name
Current Branch: temp/fix-all
Workspace Summary: 커밋들이 로그 제거, DTO 이름 수정, API 응답 키 정리처럼 여러 작은 변경으로 흩어져 있다.
Work Intent: 엉망으로 쪼개진 수정들을 하나의 API 응답 정리 작업으로 묶어 설명할 브랜치명이 필요하다.
Branch Context: 실제 변경은 인증/추천 공통 응답 포맷 정리 쪽에 더 가깝다.
Existing Branches: feat/be/api-response-normalization/S14P31B103-145, fix/be/auth-null-guard/S14P31B103-177
Ticket Ref: S14P31B103-203
Naming Constraints: avoid vague words like misc or temp, keep business meaning first
