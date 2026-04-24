# ✅ 오늘 할 일 (Daily To-Dos)

매일의 작업 목표를 설정하고 달성 여부를 체크하는 공간입니다. 상세한 이유와 트러블슈팅은 `03_dev_log.md`에 기록하고, 여기서는 실행 항목만 심플하게 관리합니다.

## 🗓️ 현재 진행 중 / 다음 할 일 (To-Do)

`작업 원칙:` 프로젝트 의존성 설치(`pnpm install`)와 실제 빌드 검증(`pnpm run build`, `pnpm run lint`)은 Windows 터미널 기준으로만 수행한다. Codex 검증 환경은 보조 확인용으로 사용하며, 프로젝트 `node_modules` 재설치는 Windows 환경을 기준으로 유지한다.

### 인프라 우선 마무리
- [ ] **Task 9:** `packages/storage` 저장소 계약 정리 (SQLite 스키마, 로컬 파일 저장 경로, SecretStorage 역할 분리)
- [ ] **Task 9-1:** `better-sqlite3` 설치 스크립트 승인 여부 확인 및 런타임 검증 (`pnpm approve-builds`)
- [ ] **Task 10:** `shared-types`와 저장 스키마 간 공통 타입 불일치 항목 점검 및 정리 범위 확정 (패키지명 `@gitcat/shared-types` 통일, AI 문서 기준 SQLite 스키마/파일 저장 초안 반영 완료, Core 담당 합의 대기)
- [ ] **Task 11:** Extension 내부 메시지 라우팅 뼈대 정리 (Webview 요청 → 서비스 호출 → 응답/ERROR 반환 흐름)
- [ ] **Task 12:** GitCat 배포 파이프라인 구축 (`.vsix` 패키징 자동화)

### AI / 신형섭 역할 다음 단계
- [ ] **Task 13:** AI 결과 저장 계약 정리 (`parsed_ai_result` → `proposal_feedback_payload` → SQLite/로컬 파일 저장 흐름)
- [ ] **Task 14:** 신형섭 담당 흐름 기준 mock 작성 (`parsed_ai_result` 2종, `proposal_feedback_payload` accepted/edited 케이스)
- [ ] **Task 15:** AI 결과 수락/수정/거절 메시지 라우팅 설계 (`ACCEPT_MERGE`, `REJECT_MERGE`, feedback 저장 호출)
- [ ] **Task 16:** 실제 모델 연결 전에도 mock 기반으로 결과 표시 및 피드백 저장이 동작하는지 검증

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
