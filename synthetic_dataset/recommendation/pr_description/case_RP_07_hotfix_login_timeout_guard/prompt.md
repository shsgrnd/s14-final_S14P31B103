당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 PR 제목과 본문을 함께 담은 markdown 추천을 JSON 형식으로 반환해 주세요.

Project ID: proj_gitcat_rec_27
Feature Type: recommendation
Recommendation Type: pr_description
Current Branch: fix/fe/login-timeout-guard/S14P31B103-207
Change Summary: 로그인 timeout 이후 늦게 도착한 응답이 상태를 다시 덮어쓰는 race condition을 막았다.
Changed Files: apps/extension/src/features/auth/LoginController.ts, apps/webview-ui/src/hooks/useLogin.ts
Work Intent: 긴급 수정 배경과 검증 포인트가 명확한 PR 설명이 필요하다.
Diff Summary: request cancellation guard, stale response ignore, loading state stabilization
Branch Context: Base branch develop, user-facing auth issue with immediate impact
Message Constraints: use fix framing, mention reproduced symptom and validation
Ticket Ref: S14P31B103-207
