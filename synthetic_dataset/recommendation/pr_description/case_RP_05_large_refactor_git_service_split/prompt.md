당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 PR 제목과 본문을 함께 담은 markdown 추천을 JSON 형식으로 반환해 주세요.

Project ID: proj_gitcat_rec_25
Feature Type: recommendation
Recommendation Type: pr_description
Current Branch: refactor/git/git-service-decomposition/S14P31B103-205
Change Summary: GitService를 branch, diff, log, merge 전용 서비스로 분리하고 호출부를 재배치했다.
Changed Files: apps/extension/src/features/git/GitService.ts, apps/extension/src/features/git/BranchCleanupService.ts, packages/git-core/src/ports/IGitClient.ts
Work Intent: 대규모 서비스 분해 리팩토링의 목적과 리스크를 리뷰어가 빠르게 이해할 수 있는 PR 설명이 필요하다.
Diff Summary: service extraction, dependency injection update, module boundary cleanup
Branch Context: Base branch develop, large file move without intended behavior change
Message Constraints: call out refactor scope, mention no behavior change target
Ticket Ref: S14P31B103-205
