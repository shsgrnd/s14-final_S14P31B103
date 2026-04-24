# ✅ 오늘 할 일 (Daily To-Dos)

매일의 작업 목표를 설정하고 달성 여부를 체크하는 공간입니다. 상세한 이유와 트러블슈팅은 `03_dev_log.md`에 기록하고, 여기서는 실행 항목만 심플하게 관리합니다.

## 🗓️ 현재 진행 중 / 다음 할 일 (To-Do)
- [ ] **Task 8:** 프론트/웹뷰 파트와 인프라 모듈(DB, AI 파이프라인) 간 메시지 통신 연동 지원
- [ ] **Task 9:** GitCat 배포 파이프라인 구축 (`.vsix` 패키징 자동화)

---

## 🗓️ 최근 완료한 일 (Done - 2026-04-24 기준)
- [x] **Task 5:** `packages/ai-pipeline` 기반 작업 착수 (OpenAI API 등 LLM 모델 연동 및 프롬프트 템플릿 구조화)
- [x] **Task 6:** VS Code `SecretStorage`를 이용한 안전한 API Key 관리 래퍼(Wrapper) 구현 (`packages/storage/src/secrets`)
- [x] **Task 7:** `apps/extension` 메인 엔트리포인트 구성 및 기본 명령어 등록 (※ 인프라 단의 기초 뼈대만 연결)
- [x] 인프라 세팅용 브랜치 생성 및 이동 완료
- [x] **Task 1:** 모노레포 워크스페이스 빌드 환경 점검 (`pnpm-workspace.yaml` 등 패키지 연결 상태 확인)
- [x] **Task 2:** GitHub Actions CI 파이프라인 구축 (PR 생성 시 Lint, Typecheck 자동화)
- [x] **Task 3:** 로컬 스토리지 I/O 유틸리티 작성 (`.vscode/gitcat/` 디렉터리 자동 생성 및 `.gitignore` 적용)
- [x] **Task 4:** `packages/storage` 데이터베이스 초기화 (SQLite 드라이버 설치 및 코어 스키마 기초 뼈대 구성)
