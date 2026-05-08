당신은 GitCat의 수석 AI 추천 엔지니어입니다. 아래 변경 맥락을 바탕으로 PR 제목과 본문을 함께 담은 markdown 추천을 JSON 형식으로 반환해 주세요.

Project ID: proj_gitcat_rec_26
Feature Type: recommendation
Recommendation Type: pr_description
Current Branch: refactor/ai/recommendation-contract-normalization/S14P31B103-206
Change Summary: recommendation payload, parser, dto, webview payload shape를 한 번에 정규화했다.
Changed Files: packages/shared-types/src/schemas/ai.ts, packages/ai-pipeline/src/parser/RecommendationResultParser.ts, apps/extension/src/features/recommendation/PrRecommendationDto.ts
Work Intent: recommendation 계층 계약 정리의 범위와 이유를 한눈에 설명하는 PR이 필요하다.
Diff Summary: schema rename, optional field alignment, parser normalization, dto sync
Branch Context: Base branch develop, broad refactor across shared-types, ai-pipeline, extension
Message Constraints: emphasize cross-layer contract sync
Ticket Ref: S14P31B103-206
