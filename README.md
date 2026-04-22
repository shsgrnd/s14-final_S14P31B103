# 🐱 GitCat (안전한 작업 관리 및 스마트 병합 솔루션)

GitCat은 생성형 AI 코딩 환경에서 흔히 발생하는 예기치 않은 로컬 작업 유실을 방지하고, 코드 병합(Merge) 단계의 충돌을 똑똑하게 예측하여 안전한 개발 워크플로우를 제공하는 **VS Code Extension 기반 로컬 실행형 Git 보조 도구**입니다. 

본 저장소는 GitCat 서비스를 구성하는 익스텐션 코어, 웹뷰 UI, AI 파이프라인 등을 통합 관리하는 **기능 분리형 모노레포(Monorepo)**입니다.

---

## 📌 핵심 가치 (Core Values)
1. **AI 작업 직전 자동 스냅샷 생성**: 예기치 못한 코드 변경으로 인한 유실 방지
2. **AI 작업 단위 원복**: 문제가 발생한 AI 작업 이전 상태로 즉시 롤백
3. **병합 전 충돌 설명**: 병합 전에 발생할 수 있는 충돌 지점을 미리 분석하여 이해하기 쉽게 설명
4. **중재 방향 제안**: 충돌 해결을 위한 논리적 중재 방향 제시
5. **diff/patch 기반 병합 초안 생성**: AI가 제안하는 병합 초안을 diff/patch 형태로 제공
6. **Git 편의성 향상**: 커밋 메시지, 브랜치명, 작업 설명 자동 추천

---

## 📂 폴더 구조 및 역할 (Project Structure)

현재 MVP 구현 범위에 맞춰 VS Code Extension 및 독립적인 AI 파이프라인을 중점으로 설계되었습니다.

```text
📦 GitCat Workspace
 ┣ 📂 apps/             # 구동 가능한 실행 계층
 ┃ ┣ 📂 extension/      # VS Code Extension Host (Node.js 기반, 명령어/웹뷰 제어)
 ┃ ┗ 📂 webview-ui/     # VS Code 내부 Webview UI (브라우저 기반 프론트엔드)
 ┃
 ┣ 📂 packages/         # 애플리케이션 간 공유되는 공통 비즈니스 로직 및 모듈
 ┃ ┣ 📂 ai-pipeline/    # AI 핵심 로직 (입력 수집, 모델 호출, 응답 파싱, 피드백 처리)
 ┃ ┣ 📂 git-core/       # 로컬 Git 스냅샷 및 복구 기능 등 코어 Git 조작 모듈
 ┃ ┗ 📂 shared-types/   # 애플리케이션 전반에서 사용되는 공통 타입 및 인터페이스
 ┃
 ┣ 📂 infra/            # CI/CD 파이프라인, 자동화 스크립트 등
 ┃
 ┗ 📂 docs/             # 프로젝트 산출물 및 문서 관리 영역 (팀 공통)
   ┣ 📂 api/            # 기능 명세 및 인터페이스 명세서 (AI schema 등)
   ┣ 📂 architecture/   # 아키텍처 다이어그램 및 시스템/모듈 구성, 기술 스택
   ┣ 📂 conventions/    # Git 브랜치 전략, 커밋 메시지 규칙 등 팀 룰 (git_convention.md)
   ┣ 📂 design/         # UI 시안 및 목업 이미지
   ┣ 📂 meeting-notes/  # 주기적 스크럼 및 멘토링/회의록
   ┣ 📂 planning/       # PRD(프로젝트 기획서) 등 방향성 설계 문서
   ┗ 📂 scenarios/      # 코드 병합, 스냅샷 등 데모 및 테스트 시나리오
```

---

## 🚀 빠른 시작 (Getting Started)
> **(TODO)** 각 패키지 초기 세팅 이후 모노레포 워크스페이스 구성 및 빌드 가이드를 작성할 예정입니다.

1. 의존성 설치: `...` (작성 예정)
2. 환경 변수 세팅: `.env.example`을 참고하여 `.env` 설정
3. 빌드 및 익스텐션 디버깅: `...` (작성 예정)

---

## 🛠 기술 스택 (Tech Stack)
문서 폴더의 `docs/architecture/GitCat_tech_stack.csv` 문서를 참고해주세요.

---

## 🤝 협업 가이드 (Contributing)
코드 기여 및 브랜치 규칙 등 팀 통합 규정은 `docs/conventions/git_convention.md` 문서를 반드시 확인하고 준수해 주세요.
