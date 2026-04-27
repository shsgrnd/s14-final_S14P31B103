# ✅ 오늘 할 일 (Daily To-Dos)

매일의 작업 목표를 설정하고 달성 여부를 체크하는 공간입니다. 상세한 이유와 트러블슈팅은 `03_dev_log.md`에 기록하고, 여기서는 실행 항목만 심플하게 관리합니다.

## 🗓️ 현재 진행 중 / 다음 할 일 (To-Do)

`작업 원칙:` 프로젝트 의존성 설치(`pnpm install`)와 실제 빌드 검증(`pnpm run build`, `pnpm run lint`)은 Windows 터미널 기준으로만 수행한다. Codex 검증 환경은 보조 확인용으로 사용하며, 프로젝트 `node_modules` 재설치는 Windows 환경을 기준으로 유지한다.

### 오늘 집중 태스크 (2026-04-27 / 신형섭 - Infra + AI)
- [x] **Task 9:** AI 결과 저장 경계 정리
  - SQLite / 로컬 파일 / SecretStorage 책임 구분을 문서 기준으로 다시 확인한다.
  - `parsed_ai_result`와 `proposal_feedback_payload`가 저장될 때 어떤 필드는 DB에, 어떤 필드는 `*_ref`로 빠지는지 매핑표를 정리한다.
  - Core 담당자에게 넘길 구현 경계와 신형섭 담당 계약 범위를 분리해 기록한다.
  - 결과 문서: `infra/docs/personal/05_ai_result_storage_contract.md`
- [ ] **Task 9-1:** `better-sqlite3` 런타임 검증 필요 여부 체크
  - `pnpm approve-builds` 승인 여부와 실제 실행 리스크를 확인 대상 항목으로 남긴다.
  - 오늘은 설치 재작업보다 "Windows 환경에서 별도 검증 필요" 여부를 명확히 남기는 데 집중한다.
- [x] **Task 10:** `shared-types` ↔ AI 문서 ↔ SQLite 스키마 불일치 체크리스트 작성
  - `parsed_ai_result`, `proposal_feedback_payload`, enum/status 값의 불일치 후보를 정리한다.
  - 문서에 이미 있는 규칙과 코드에 아직 없는 규칙을 구분해 적는다.
  - 결과 문서: `infra/docs/personal/06_ai_contract_mismatch_checklist.md`
- [x] **Task 11:** AI 결과 반영용 메시지 규약 / 라우팅 초안 정리
  - `ACCEPT_MERGE`, `REJECT_MERGE`, feedback 저장 호출에 필요한 request/response payload shape를 정리한다.
  - Webview → Extension → Storage로 이어지는 최소 흐름을 메시지 단위로 설명 가능하게 만든다.
  - 결과 문서: `infra/docs/personal/07_ai_result_message_routing_draft.md`
- [x] **Task 12:** 신형섭 담당 mock 산출물 작성
  - `parsed_ai_result` mock 2종 작성
  - `proposal_feedback_payload` mock 2종 작성
  - UI/Core 담당이 실제 모델 호출 없이도 붙일 수 있는 예시 데이터 기준을 고정한다.
  - 결과 문서: `infra/docs/personal/08_ai_result_mock_samples.md`
- [x] **Task 13:** mock 기반 결과 표시 / 저장 흐름 검증 기준 정리
  - 실제 모델 연결 전에도 "결과 표시 → 수락/수정/거절 → 저장" 흐름을 검증할 수 있도록 체크포인트를 만든다.
  - 필요한 경우 코어 담당 협업 포인트와 UI 담당 전달 포인트를 구분한다.
  - 결과 문서: `infra/docs/personal/09_ai_result_flow_validation_checkpoints.md`

### 오늘 보류 / 후순위
- [ ] **Task 14:** GitCat 배포 파이프라인 구축 (`.vsix` 패키징 자동화)
  - 오늘은 저장 계약과 AI 결과 흐름 고정이 우선이다.
  - 배포 자동화는 인프라 마감 단계에서 다시 착수한다.

---

## 🗓️ 최근 완료한 일 (Done - 2026-04-24 기준)
- [x] **Task 8:** 모노레포 실행 안정화 (`shared-types` 패키지명 통일, Windows 기준 `pnpm install/build/lint` 통과)
- [x] **Task 5:** `packages/ai-pipeline` 기반 작업 착수 (OpenAI API 등 LLM 모델 연동 및 프롬프트 템플릿 구조화)
- [x] **Task 6:** VS Code `SecretStorage`를 이용한 안전한 API Key 관리 래퍼(Wrapper) 구현 (`packages/storage/src/secrets`)
- [x] **Task 7:** `apps/extension` 메인 엔트리포인트 구성 및 기본 명령어 등록 (※ 인프라 단의 기초 뼈대만 연결)
- [x] 인프라 세팅용 브랜치 생성 및 이동 완료
- [x] **Task 1:** 모노레포 워크스페이스 빌드 환경 점검 (`pnpm-workspace.yaml` 등 패키지 연결 상태 확인)
- [x] **Task 2:** GitHub Actions CI 파이프라인 구축 (PR 생성 시 Lint, Typecheck 자동화)
- [x] **Task 3:** 로컬 스토리지 I/O 유틸리티 작성 (`.vscode/gitcat/` 디렉터리 자동 생성 및 `.gitignore` 적용)
- [x] **Task 4:** `packages/storage` 데이터베이스 초기화 (SQLite 드라이버 설치 및 코어 스키마 기초 뼈대 구성)
