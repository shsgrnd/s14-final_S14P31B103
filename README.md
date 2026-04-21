# 🐱 GitCat (안전한 작업 관리 및 스마트 병합 솔루션)

GitCat은 생성형 AI 코딩 환경에서 흔히 발생하는 예기치 않은 로컬 작업 유실을 방지하고, 코드 병합(Merge) 단계의 충돌을 똑똑하게 예측하여 안전한 개발 워크플로우를 제공하는 **Git 확장 프로그램**입니다. 본 저장소는 GitCat 서비스를 구성하는 프론트엔드, 백엔드, AI 모델을 통합 관리하는 **모노레포(Monorepo)**입니다.

---

## 📌 주요 기능 (Key Features)
1. **안전 스냅샷 (Safety Layer)**: 커밋되지 않은 AI 작업 실행 전 상태를 자동으로 기록하여 문제 발생 시 최후 상태로 즉시 원복
2. **AI 충돌 예측 및 중재**: 병합 이전 워크트리를 분석하여 구조적 충돌 지점을 식별하고 AI 병합 초안 및 중재안 제공
3. **부가 기능 (Git 편의성)**: 변경 사항 기반 커밋/PR 메시지 자동 추천, 브랜치명 추천, 방치된 로컬 브랜치 정리

---

## 📂 폴더 구조 및 역할 (Project Structure)

```text
📦 GitCat Workspace
 ┣ 📂 apps/             # 구동 가능한 독립 애플리케이션
 ┃ ┣ 📂 extension/      # 클라이언트 애플리케이션 (GUI, VS Code 확장 프로그램 / 데스크톱 앱)
 ┃ ┣ 📂 backend/        # 사용자 메타데이터, 변경 이력 및 정적 분석 API 서버 (설정: 백엔드 파트)
 ┃ ┗ 📂 ai/             # 하네스 프롬프팅 적용 및 AI 병합 초안/중재안 제공 파이프라인 (설정: AI 파트)
 ┃
 ┣ 📂 packages/         # 애플리케이션 간 공유되는 공통 비즈니스 로직 및 모듈
 ┃ ┣ 📂 git-manager/    # 로컬 Git 스냅샷 및 복구 기능 등 코어 Git 조작 모듈
 ┃ ┣ 📂 conflict-analyzer/# 정적 분석 및 병합 충돌 가능성 분석 모듈
 ┃ ┣ 📂 prompt-utils/   # 컨텍스트 파악 및 AI 프롬프트 템플릿 처리 모듈
 ┃ ┗ 📂 shared-types/   # 애플리케이션 전반에서 사용되는 공통 타입 및 스키마 (DTO 등)
 ┃
 ┣ 📂 infra/            # 배포, 인프라 구성, 자동화 스크립트 등
 ┃
 ┗ 📂 docs/             # 프로젝트 산출물 및 문서 관리 영역 (팀 공통)
   ┣ 📂 api/            # 기능 명세 및 인터페이스 명세서
   ┣ 📂 architecture/   # 아키텍처 다이어그램 및 시스템/모듈 구성, 기술 스택
   ┣ 📂 conventions/    # Git 브랜치 전략, 커밋 메시지 규칙 등 팀 룰 (git_convention.md)
   ┣ 📂 design/         # UI 시안 및 목업 이미지
   ┣ 📂 meeting-notes/  # 주기적 스크럼 및 멘토링/회의록
   ┣ 📂 planning/       # PRD(프로젝트 기획서) 등 방향성 설계 문서
   ┗ 📂 scenarios/      # 코드 병합, 스냅샷 등 데모 및 테스트 시나리오
```

---

## 🚀 빠른 시작 (Getting Started)
> **(TODO)** 각 서비스 초기 세팅 이후 모노레포 워크스페이스(Yarn Workspace / pnpm 등) 구성 방법 및 `docker-compose.yml`을 활용한 로컬 환경 구축 명령어 가이드를 작성할 예정입니다.

1. 의존성 설치: `...` (작성 예정)
2. 환경 변수 세팅: `.env.example`을 참고하여 `.env` 설정
3. 로컬 서버 구동: `...` (작성 예정)

---

## 🛠 기술 스택 (Tech Stack)
문서 폴더의 `docs/architecture/GitCat_tech_stack.csv` 문서를 참고해주세요.
> **(TODO)** 주요 기술 스택 아이콘 혹은 리스트를 여기에 추가로 요약 정리하면 좋습니다.

---

## 🤝 협업 가이드 (Contributing)
코드 기여 및 브랜치 규칙 등 팀 통합 규정은 `docs/conventions/git_convention.md` 문서를 반드시 확인하고 준수해 주세요.
