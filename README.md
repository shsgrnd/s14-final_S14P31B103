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
> 본 프로젝트는 **pnpm workspace**를 사용하는 모노레포 구조입니다. 패키지 의존성을 관리하고 프로젝트를 빌드하기 위해 아래 가이드를 따라주세요.

1. **pnpm 전역 설치 (미설치 시)**:
   ```bash
   npm install -g pnpm
   ```
2. **의존성 설치**: 반드시 프로젝트 루트(최상단) 디렉터리에서 실행합니다.
   ```bash
   pnpm install
   ```
3. **환경 변수 세팅**: 루트 디렉터리의 `.env.example`을 참고하여 `.env` 파일을 설정합니다.
4. **전체 패키지 빌드**:
   ```bash
   pnpm run build
   ```
5. **익스텐션 디버깅**: VS Code에서 `apps/extension` 폴더를 열고 `F5`를 눌러 Extension Development Host 환경에서 실행합니다.

---

## 🤗 로컬 모델 다운로드
`live-local` 모드에서 사용하는 로컬 GGUF 모델은 아래 Hugging Face 저장소에서 받을 수 있습니다.

- 모델 저장소: https://huggingface.co/shsgrnd/SSAFY_gitcat-local-llm
- 권장 파일:
  - `gitcat-v3-sft-merged-Q4_K_M.gguf`
  - `gitcat-v3-dpo-merged-Q4_K_M.gguf`

사용 시에는 VS Code 설정에서 `Gitcat > Ai: Mode`를 `live-local`로 변경한 뒤,
`Gitcat > Ai: Local Model Path`에 다운로드한 GGUF 파일의 절대 경로를 입력하면 됩니다.

## 📦 AI 런타임 배포 정책
GitCat VSIX는 **멀티플랫폼 단일 패키지** 정책을 따릅니다. 따라서 최종 VSIX에는 플랫폼별 `node-llama-cpp` 네이티브 런타임을 동봉하지 않습니다.

- `mock`: 추가 설치 없이 바로 사용할 수 있습니다.
- `live-remote`: GMS API 키만 준비하면 사용할 수 있습니다.
- `live-local`: GGUF 모델 파일과 별도로 로컬 추론 런타임 초기 설치가 필요할 수 있습니다.

`live-local` 사용 시 준비 순서:
1. GGUF 모델 파일을 Hugging Face에서 다운로드합니다.
2. VS Code 설정에서 `Gitcat > Ai: Mode`를 `live-local`로 변경합니다.
3. `Gitcat > Ai: Local Model Path`에 GGUF 절대 경로를 입력합니다.
4. VS Code에서 Command Palette(`Ctrl+Shift+P`, macOS는 `Cmd+Shift+P`)를 연 뒤 `GitCat: Install Local Runtime`을 실행해 `node-llama-cpp` 런타임 설치를 시작합니다.

참고:
- 이 저장소에서 실험적으로 측정한 `host-only` 최적화본은 최종 배포 정책이 아닙니다.
- 최종 배포본은 특정 OS/아키텍처에 고정하지 않습니다.

## ⌨️ 주요 명령어
VS Code에서 Command Palette(`Ctrl+Shift+P`, macOS는 `Cmd+Shift+P`)를 열면 아래 GitCat 명령어를 직접 실행할 수 있습니다.

- `GitCat: Open Panel`: 메인 GitCat 패널을 엽니다.
- `GitCat: Create Snapshot`: 현재 작업 상태를 수동 스냅샷으로 저장합니다.
- `GitCat: Install Local Runtime`: `live-local`용 `node-llama-cpp` 런타임 설치를 시작합니다.

---

## 🛠 기술 스택 (Tech Stack)
문서 폴더의 `docs/architecture/GitCat_tech_stack.csv` 문서를 참고해주세요.

---

## 🤝 협업 가이드 (Contributing)
코드 기여 및 브랜치 규칙 등 팀 통합 규정은 `docs/conventions/git_convention.md` 문서를 반드시 확인하고 준수해 주세요.
