# GitCat Extension

이 패키지는 GitCat의 메인 애플리케이션인 **VS Code Extension Host**를 담당합니다.
Node.js 환경에서 동작하며, 사용자의 명령어 입력 처리, 로컬 스토리지 제어 및 Webview 패널을 띄우는 역할을 합니다.

## 주요 역할
- **명령어 처리 (`src/commands/`)**: VS Code Command Palette에서 호출되는 GitCat 명령어 처리
- **저장소 접근 (`src/storage/`)**: SQLite, 로컬 파일(스냅샷, diff 등), VS Code 내장 Storage 접근 및 제어
- **웹뷰 통신 (`src/webview/`)**: 사용자와 상호작용하는 UI(`apps/webview-ui`)를 관리하고 메시지 통신(Message Passing) 중계
- **AI 연동**: `packages/ai-pipeline`을 호출하여 비즈니스 로직을 연결하는 얇은 어댑터 역할 수행

## Command Palette 명령어
VS Code에서 Command Palette(`Ctrl+Shift+P`, macOS는 `Cmd+Shift+P`)를 열면 아래 명령어를 사용할 수 있습니다.

- `GitCat: Open Panel`
- `GitCat: Create Snapshot`
- `GitCat: Install Local Runtime`
- `GitCat: Refresh Status`

## 로컬 VSIX 패키징
- Windows 기준으로 `pnpm --dir apps/extension run package:vsix`를 실행하면 `.artifacts/` 아래에 VSIX 파일이 생성됩니다.
- 이 스크립트는 `vsce package`를 호출하며, 내부적으로 `typecheck + esbuild 번들 빌드`를 함께 수행합니다.
- GitHub Actions에서는 `.github/workflows/package-vsix.yml`로 동일한 패키징 절차를 수동 실행하거나 태그 푸시 기준으로 재사용할 수 있습니다.
- 최종 산출물은 VS Code Marketplace 배포와 `.vsix` 직접 배포에 모두 사용할 수 있습니다.
- 최종 VSIX는 **멀티플랫폼 단일 패키지** 정책을 따르며, 플랫폼별 `node-llama-cpp` 네이티브 런타임은 동봉하지 않습니다.
- 저장소에서 용량 측정을 위해 만들었던 `host-only` 최적화본은 최종 배포 정책이 아닙니다.

## 로컬 모델 설정 (`live-local`)
로컬 추론용 GGUF 모델은 아래 Hugging Face 저장소에서 다운로드할 수 있습니다.

- 모델 저장소: https://huggingface.co/shsgrnd/SSAFY_gitcat-local-llm
- 권장 파일:
  - `gitcat-v3-sft-merged-Q4_K_M.gguf`
  - `gitcat-v3-dpo-merged-Q4_K_M.gguf`

설정 순서:
1. VS Code에서 `Gitcat > Ai: Mode`를 `live-local`로 변경합니다.
2. `Gitcat > Ai: Local Model Path`에 다운로드한 GGUF 파일의 절대 경로를 입력합니다. Windows에서는 `C:\...`를 입력하면 되고, WSL에서는 같은 값을 입력해도 내부에서 `/mnt/c/...`로 자동 변환됩니다. 일반 Remote Linux/SSH 환경에서는 원격 서버 기준 절대 경로를 입력해야 합니다.
3. VS Code에서 Command Palette(`Ctrl+Shift+P`, macOS는 `Cmd+Shift+P`)를 연 뒤 `GitCat: Install Local Runtime`을 실행해 로컬 추론 런타임 설치를 시작합니다.
4. branch recommendation, commit recommendation, PR recommendation을 로컬 추론으로 실행합니다.

PR recommendation 동작 메모:
- template가 없으면 PR 제목과 본문을 한국어 기본값으로 생성합니다.
- 영어 template를 선택한 경우에는 template의 heading / placeholder 언어를 따라 영어 제목과 본문을 유지합니다.

설치 요구사항 요약:
- `mock`: 추가 준비 없음
- `live-remote`: GMS API 키 필요. 첫 AI 기능 실행 시 입력창이 뜨면 입력한 값이 VS Code SecretStorage에 저장됩니다.
- `live-local`: GGUF 모델 파일 + local runtime 설치 필요

다음 경우 `live-local`이 바로 동작하지 않을 수 있습니다.
- GGUF 파일 경로가 비어 있거나 잘못된 경우
- `node-llama-cpp` local runtime 설치가 아직 끝나지 않은 경우

이 경우에도 extension 자체와 `mock`, `live-remote` 같은 non-local 경로는 계속 사용할 수 있습니다.

추가 참고:
- merge analysis의 로컬 RAG 임베딩 경로는 선택적 런타임이 준비되지 않으면 자동으로 lexical fallback을 사용합니다.
- `GitCat: Set GitHub Token`은 GitHub PR 관련 기능용 토큰 저장 명령이며, `live-remote`용 AI API 키와는 별개입니다.
