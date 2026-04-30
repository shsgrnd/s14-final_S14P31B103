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

## ⚠️ 네이티브 모듈 트러블슈팅 (better-sqlite3)

`better-sqlite3`는 C++ 네이티브 모듈로, **VS Code의 Electron 런타임 버전**에 맞게 반드시 재빌드가 필요합니다.

### 증상
F5(디버그 실행) 시 아래와 같은 에러가 콘솔에 출력되는 경우:
```
Error: The module '.../better_sqlite3.node' was compiled against a different Node.js version
NODE_MODULE_VERSION XXX. This version of Node.js requires NODE_MODULE_VERSION YYY.
```

### 해결 방법
```powershell
# apps/extension 디렉토리에서 실행
pnpm run rebuild:native
```

이 명령어는 VS Code 1.107.x 기준(Electron 35.2.0)으로 `better-sqlite3`를 재빌드합니다.

### VS Code 버전이 업그레이드된 경우
VS Code 버전이 바뀌면 Electron 버전도 바뀔 수 있습니다. 이 경우:
1. VS Code 개발자 도구(Ctrl+Shift+I) → Console에서 `process.versions.electron` 확인
2. `package.json`의 `rebuild:native` 스크립트 내 `--version` 값을 해당 버전으로 수정 후 재실행

