당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 팀 컨벤션에 맞는 커밋 메시지를 JSON 형식으로 추천해 주세요.

Project ID: proj_gitcat_rec_17
Feature Type: recommendation
Recommendation Type: commit_message
Current Branch: fix/fe/login-timeout-guard/S14P31B103-207
Change Summary: 로그인 timeout 이후 늦게 도착한 응답이 상태를 다시 덮어써 화면이 멈추는 race condition을 막았다.
Changed Files: apps/extension/src/features/auth/LoginController.ts, apps/webview-ui/src/hooks/useLogin.ts
Work Intent: timeout guard와 race condition 수정 사실이 보이는 커밋 메시지가 필요하다.
Diff Summary: request cancellation guard, stale response ignore, loading flag stabilization
Branch Context: 사용자 영향이 큰 긴급 수정이며 로그인 플로우에서 즉시 재현된다.
Message Constraints: conventional-commit, imperative, use fix type
Ticket Ref: S14P31B103-207
