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
6. **Git 편의성 향상**: 커밋 메시지, 브랜치명, PR 제목/본문, 작업 설명 자동 추천
7. **Git 워크플로 진행 가시화**: 변경 → 스테이징 → 커밋 → 푸시 단계를 스텝퍼로 보여주고 다음 액션을 안내
8. **스냅샷 타임라인 정리**: 스냅샷 요약명을 더 자연스럽게 표시하고 필요 시 바로 이름을 수정

---

## ✨ 최근 UX 개선
- Git 패널에 워크플로 스텝퍼를 추가해 현재 Git 진행 상태와 다음 액션을 더 직관적으로 확인할 수 있습니다.
- 스냅샷 타임라인에서 요약명을 더 명확하게 표시하고, 인라인으로 이름을 수정할 수 있습니다.
- 새로 생성되는 AI 스냅샷 요약 제목은 GitCat 언어 설정(`auto` / `ko` / `en`)을 따릅니다.
- VSIX / Marketplace 배포 식별자를 `GitCat.gitcat-vscode` 기준으로 정리해 배포 패키지 구분을 명확히 했습니다.

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

## 📥 설치 및 첫 실행
GitCat은 VS Code Marketplace에서 바로 설치하거나, GitHub Releases 등으로 받은 `.vsix` 파일로 직접 설치할 수 있습니다.

### Marketplace에서 설치
1. VS Code의 Extensions 탭을 엽니다.
2. `GitCat for VS Code`를 검색합니다.
3. `Install`을 누른 뒤 VS Code를 다시 로드하거나 재시작합니다.

### VSIX 파일로 설치

1. VS Code에서 Command Palette(`Ctrl+Shift+P`, macOS는 `Cmd+Shift+P`)를 엽니다.
2. `Extensions: Install from VSIX...`를 실행합니다.
3. 받은 `gitcat-vscode-0.1.0.vsix` 파일을 선택합니다.
4. 설치가 끝나면 VS Code를 다시 로드하거나 재시작합니다.

참고:
- 현재 Marketplace / VSIX 확장 ID는 `GitCat.gitcat-vscode`입니다.
- 기존 `GitCat.gitcat` 설치본에서 옮겨오는 경우 `live-local` 런타임과 VS Code `SecretStorage` 기반 토큰/API 키를 새 확장 기준으로 다시 설정해야 할 수 있습니다.
- 이 경우 `GitCat: Install Local Runtime`, `GitCat: Set GitHub Token`, `live-remote` AI 설정(API 키/base URL/model) 입력을 다시 한 번 수행하는 것이 안전합니다.

처음 사용할 때 권장 순서:
1. Command Palette에서 `GitCat: Open Panel`을 실행해 GitCat 패널이 열리는지 확인합니다.
2. VS Code 설정에서 `Gitcat > Ai: Mode`를 `mock`, `live-remote`, `live-local` 중 하나로 선택합니다.
3. `mock` 모드로 먼저 동작을 확인한 뒤, 필요하면 `live-remote` 또는 `live-local` 설정을 이어서 진행합니다.

---

## 🤗 로컬 모델 다운로드
`live-local` 모드에서 사용하는 로컬 GGUF 모델은 아래 Hugging Face 저장소에서 받을 수 있습니다.

- 모델 저장소: https://huggingface.co/shsgrnd/SSAFY_gitcat-local-llm
- 권장 파일:
  - `gitcat-v3-sft-merged-Q4_K_M.gguf`
  - `gitcat-v3-dpo-merged-Q4_K_M.gguf`

사용 시에는 VS Code 설정에서 `Gitcat > Ai: Mode`를 `live-local`로 변경한 뒤,
`Gitcat > Ai: Local Model Path`에 다운로드한 GGUF 파일의 절대 경로를 입력하면 됩니다.
WSL 환경에서는 Windows의 `C:\...` 경로를 입력해도 내부에서 `/mnt/c/...`로 자동 변환됩니다.
일반 Remote Linux/SSH 환경에서는 자동 변환되지 않으므로, 원격 서버 기준 실제 절대 경로를 입력해야 합니다.

## 📦 AI 런타임 배포 정책
GitCat VSIX는 **멀티플랫폼 단일 패키지** 정책을 따릅니다. 따라서 최종 VSIX에는 플랫폼별 `node-llama-cpp` 네이티브 런타임을 동봉하지 않습니다.

- `mock`: 추가 설치 없이 바로 사용할 수 있습니다.
- `live-remote`: AI API 키와 remote base URL/model 설정이 필요합니다. 키는 GitCat 사이드바의 키 아이콘에서 입력해 VS Code SecretStorage에 저장하고, remote base URL/model은 같은 UI에서 함께 관리합니다.
- `live-local`: GGUF 모델 파일과 별도로 로컬 추론 런타임 초기 설치가 필요할 수 있습니다.

`live-remote` 사용 시 준비 순서:
1. VS Code 설정에서 `Gitcat > Ai: Mode`를 `live-remote`로 변경합니다.
2. GitCat 사이드바 하단의 키 아이콘을 눌러 AI 설정 UI를 엽니다.
3. `API Key`, `Remote Base URL`, `Remote Model`을 입력해 저장합니다.
4. API 키는 VS Code SecretStorage에 저장되며, base URL/model은 `gitcat.ai.remoteBaseUrl`, `gitcat.ai.remoteModel` 설정에 저장됩니다.
5. 기존처럼 `.env`의 `GMS_KEY`, `GMS_BASE_URL`, `GMS_MODEL`도 fallback으로 계속 사용할 수 있습니다.

`live-local` 사용 시 준비 순서:
1. GGUF 모델 파일을 Hugging Face에서 다운로드합니다.
2. VS Code 설정에서 `Gitcat > Ai: Mode`를 `live-local`로 변경합니다.
3. `Gitcat > Ai: Local Model Path`에 GGUF 절대 경로를 입력합니다. Windows에서는 `C:\...`를 입력하면 되고, WSL에서는 같은 값을 입력해도 내부에서 `/mnt/c/...`로 자동 변환됩니다. 일반 Remote Linux/SSH 환경에서는 원격 서버 기준 절대 경로를 입력합니다.
4. VS Code에서 Command Palette(`Ctrl+Shift+P`, macOS는 `Cmd+Shift+P`)를 연 뒤 `GitCat: Install Local Runtime`을 실행해 `node-llama-cpp` 런타임 설치를 시작합니다.
5. 설치가 끝나면 브랜치 추천, 커밋 추천, PR 추천 같은 AI 기능을 다시 실행합니다.

## 📝 PR 추천 언어 정책
- `PR recommendation`은 기본적으로 **한국어 제목과 본문**을 생성합니다.
- PR template를 함께 사용하는 경우에는 template의 섹션 구조와 순서를 최대한 유지합니다.
- `gitcat.language`가 `en`이면 PR 제목과 본문은 영어로 생성되고, `ko`이면 한국어로 생성됩니다.
- 영어 template를 사용하는 경우에도 template의 **마크다운 섹션 heading 줄은 그대로 유지**하고, heading이 아닌 본문/체크리스트/placeholder/helper text는 현재 GitCat 언어 설정에 맞춰 다시 작성합니다.

참고:
- 이 저장소에서 실험적으로 측정한 `host-only` 최적화본은 최종 배포 정책이 아닙니다.
- 최종 배포본은 특정 OS/아키텍처에 고정하지 않습니다.
- `live-local` 준비가 끝나지 않았더라도 `mock` 모드와 `live-remote` 모드는 계속 사용할 수 있습니다.

## 🔐 토큰과 API 키 안내
- `GitCat: Set GitHub Token`: GitHub PR 관련 기능에 사용할 GitHub Personal Access Token을 저장합니다.
- `live-remote`용 AI API 키는 GitHub 토큰과 별개입니다.
- `live-remote`는 UI에 저장한 API 키/base URL/model을 우선 사용하고, 값이 비어 있으면 `GMS_KEY`, `GMS_BASE_URL`, `GMS_MODEL` 환경 변수로 fallback합니다.

## ⌨️ 주요 명령어
VS Code에서 Command Palette(`Ctrl+Shift+P`, macOS는 `Cmd+Shift+P`)를 열면 아래 GitCat 명령어를 직접 실행할 수 있습니다.

- `GitCat: Open Panel`: 메인 GitCat 패널을 엽니다.
- `GitCat: Refresh Status`: 현재 워크스페이스의 Git 상태를 다시 조회합니다.
- `GitCat: Create Snapshot`: 현재 작업 상태를 수동 스냅샷으로 저장합니다.
- `GitCat: Install Local Runtime`: `live-local`용 `node-llama-cpp` 런타임 설치를 시작합니다.
- `GitCat: Set GitHub Token`: GitHub PR 기능용 토큰을 저장합니다.
- `GitCat: Clear GitHub Token`: 저장된 GitHub PR 기능용 토큰을 제거합니다.

---

## 🛠 기술 스택 (Tech Stack)
문서 폴더의 `docs/architecture/GitCat_tech_stack.csv` 문서를 참고해주세요.

---

## 🤝 협업 가이드 (Contributing)
코드 기여 및 브랜치 규칙 등 팀 통합 규정은 `docs/conventions/git_convention.md` 문서를 반드시 확인하고 준수해 주세요.
