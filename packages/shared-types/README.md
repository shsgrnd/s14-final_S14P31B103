# GitCat Shared Types

이 패키지는 GitCat 모노레포를 구성하는 여러 패키지(`apps/extension`, `packages/ai-pipeline` 등)에서 공통으로 사용되는 타입 및 인터페이스를 정의합니다.

## 관리 항목
- **AI 인터페이스 명세**: `ai_task_request`, `ai_input_payload`, `parsed_ai_result`, `proposal_feedback_payload`
- **추천 관련 스키마**: `recommendation`, `recommendation_type`
- **기타 DTO 및 모델**: Extension - Webview 간 통신을 위한 메시지 타입 등

`docs/api/ai`에 정의된 문서를 바탕으로 코드 레벨의 TypeScript Interface, Zod 스키마 등이 이곳에 작성되며, 이를 통해 각 파트 간의 원활한 병렬 개발을 보장합니다.
