당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 팀 컨벤션에 맞는 커밋 메시지를 JSON 형식으로 추천해 주세요.

Project ID: proj_gitcat_rec_13
Feature Type: recommendation
Recommendation Type: commit_message
Current Branch: feat/be/api-response-cleanup/S14P31B103-203
Change Summary: 로그 제거, 응답 키 rename, DTO 이름 수정, validation 메시지 정리가 여러 커밋으로 흩어져 있다.
Changed Files: packages/shared-types/src/schemas/ai.ts, apps/extension/src/features/recommendation/CommitRecommendationService.ts, packages/storage/src/sqlite/repositories/recommendation/SqliteRecommendationHistoryRepository.ts
Work Intent: 어수선한 변경을 API 응답 포맷 정리 하나의 이야기로 묶는 커밋 메시지가 필요하다.
Diff Summary: response field rename, enum cleanup, validation copy cleanup, debug log removal
Branch Context: 작은 잡수정이 많지만 핵심은 recommendation 관련 응답 포맷 정리다.
Message Constraints: conventional-commit, imperative, avoid vague cleanup-only wording
Ticket Ref: S14P31B103-203
