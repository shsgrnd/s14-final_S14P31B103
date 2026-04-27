# GitCat Extension

이 패키지는 GitCat의 메인 애플리케이션인 **VS Code Extension Host**를 담당합니다.
Node.js 환경에서 동작하며, 사용자의 명령어 입력 처리, 로컬 스토리지 제어 및 Webview 패널을 띄우는 역할을 합니다.

## 주요 역할
- **명령어 처리 (`src/commands/`)**: VS Code Command Palette에서 호출되는 GitCat 명령어 처리
- **저장소 접근 (`src/storage/`)**: SQLite, 로컬 파일(스냅샷, diff 등), VS Code 내장 Storage 접근 및 제어
- **웹뷰 통신 (`src/webview/`)**: 사용자와 상호작용하는 UI(`apps/webview-ui`)를 관리하고 메시지 통신(Message Passing) 중계
- **AI 연동**: `packages/ai-pipeline`을 호출하여 비즈니스 로직을 연결하는 얇은 어댑터 역할 수행

## 로컬 VSIX 패키징
- Windows 기준으로 `pnpm --dir apps/extension run package:vsix`를 실행하면 `.artifacts/` 아래에 VSIX 파일이 생성됩니다.
- 이 스크립트는 `vsce package`를 호출하며, 내부적으로 `vscode:prepublish`를 통해 extension compile도 함께 수행합니다.
- GitHub Actions에서는 `.github/workflows/package-vsix.yml`로 동일한 패키징 절차를 수동 실행하거나 태그 푸시 기준으로 재사용할 수 있습니다.
