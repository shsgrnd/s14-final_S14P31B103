당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 PR 제목과 본문을 함께 담은 markdown 추천을 JSON 형식으로 반환해 주세요.

Project ID: proj_gitcat_rec_23
Feature Type: recommendation
Recommendation Type: pr_description
Current Branch: feat/be/api-response-cleanup/S14P31B103-203
Change Summary: 응답 키 rename, DTO 이름 정리, validation copy 수정, debug log 제거가 섞여 있다.
Changed Files: packages/shared-types/src/schemas/ai.ts, apps/extension/src/features/recommendation/CommitRecommendationService.ts, packages/storage/src/sqlite/repositories/recommendation/SqliteRecommendationHistoryRepository.ts
Work Intent: messy commit 상태지만 recommendation 응답 포맷 정리라는 하나의 이야기로 PR을 묶고 싶다.
Diff Summary: response key normalization, schema cleanup, debug log removal
Branch Context: Base branch develop, multiple small commits with one normalization theme
Message Constraints: highlight common theme, avoid vague misc wording
Ticket Ref: S14P31B103-203
