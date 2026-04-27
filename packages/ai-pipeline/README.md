# GitCat AI Pipeline

이 패키지는 외부 LLM(추후 로컬 모델 포함)을 호출하고 로직을 처리하는 순수 비즈니스 로직입니다.
VS Code 환경에 전혀 의존하지 않으므로, 독립적인 Mock 데이터 기반 테스트 및 병렬 개발이 가능합니다.

## 디렉토리 구조 및 역할 분담 (AI 파트 3인)

- **`src/input/` (담당: 허서연)**
  - 로컬 파일 변경사항, Git 상태 등 다양한 컨텍스트를 수집하고 통합하여 AI에게 보낼 일관된 형태의 Payload(`ai_input_payload`)를 생성합니다.
- **`src/generation/` (담당: 남주완)**
  - 생성된 Payload를 바탕으로 프롬프트를 구성하고, 실제 외부 LLM API(또는 로컬 모델)를 호출한 후 결과를 일정한 구조(`parsed_ai_result`)로 파싱합니다.
- **`src/feedback/` (담당: 신형섭)**
  - 생성된 결과에 대한 사용자의 평가/피드백(`proposal_feedback_payload`)을 받아들이고, 이후 모델 학습이나 로컬 적응을 위한 데이터 저장(학습 후보화)을 처리합니다.

## 실행 경로

- mock 검증: `pnpm --filter @gitcat/ai-pipeline run test:mock`
- 실제 LLM smoke run:
  - 루트 `.env`에 `GMS_KEY=...`, `GMS_BASE_URL=...` 저장
  - 필요하면 `GMS_MODEL=gpt-4.1-mini` 지정
  - `pnpm --filter @gitcat/ai-pipeline run test:live -- merge_mediation`
  - `pnpm --filter @gitcat/ai-pipeline run test:live -- recommendation_branch_name`

### live run 메모

- `test:live`는 UI/저장 연결 없이 mock `ai_input_payload`를 실제 OpenAI 호출로 보내고 `parsed_ai_result`를 출력합니다.
- 루트 `.env`가 있으면 자동으로 읽고, 셸에 이미 주입된 환경변수는 덮어쓰지 않습니다.
- `GMS_BASE_URL`을 기준으로 실제 SDK base URL을 `.../api.openai.com/v1` 형태로 조립합니다.
- 시나리오 이름은 `merge_mediation`, `conflict_explanation`, `merge_patch_draft`, `recommendation_branch_name`, `recommendation_commit_message`, `recommendation_work_description` 중에서 선택합니다.
- 모델은 `GMS_MODEL`을 우선 사용하며, 필요하면 다른 값으로 덮어쓸 수 있습니다.
