당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 팀 컨벤션에 맞는 커밋 메시지를 JSON 형식으로 추천해 주세요.

Project ID: proj_gitcat_rec_16
Feature Type: recommendation
Recommendation Type: commit_message
Current Branch: refactor/ai/recommendation-contract-normalization/S14P31B103-206
Change Summary: recommendation payload, parser, dto, webview payload shape를 한 번에 정규화했다.
Changed Files: packages/shared-types/src/schemas/ai.ts, packages/ai-pipeline/src/parser/RecommendationResultParser.ts, apps/extension/src/features/recommendation/PrRecommendationDto.ts
Work Intent: 계약 정규화와 schema sync 성격이 드러나는 커밋 메시지가 필요하다.
Diff Summary: payload rename, optional field alignment, parser field normalization
Branch Context: feature 추가가 아니라 recommendation 계층 전체 계약 정리다.
Message Constraints: conventional-commit, imperative, use refactor type
Ticket Ref: S14P31B103-206
