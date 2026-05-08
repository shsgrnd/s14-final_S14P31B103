당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 팀 컨벤션에 맞는 커밋 메시지를 JSON 형식으로 추천해 주세요.

Project ID: proj_gitcat_rec_15
Feature Type: recommendation
Recommendation Type: commit_message
Current Branch: refactor/git/git-service-decomposition/S14P31B103-205
Change Summary: GitService를 branch, diff, log, merge 전용 서비스로 분리하고 호출부를 각 새 모듈로 옮겼다.
Changed Files: apps/extension/src/features/git/GitService.ts, apps/extension/src/features/git/BranchCleanupService.ts, packages/git-core/src/ports/IGitClient.ts
Work Intent: 책임 분리 리팩토링이라는 사실이 분명한 커밋 메시지가 필요하다.
Diff Summary: service extraction, dependency injection updates, interface reuse
Branch Context: 동작 변경보다 대규모 구조 이동과 의존성 재배치가 중심이다.
Message Constraints: conventional-commit, imperative, use refactor type
Ticket Ref: S14P31B103-205
