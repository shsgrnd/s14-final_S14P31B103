# GitCat 포팅 메뉴얼

## 1. 문서 개요

본 문서는 GitLab 저장소를 클론한 뒤 GitCat 프로젝트를 빌드하고 실행할 수 있도록 환경, 설정, 실행 절차를 정리한 포팅 메뉴얼이다.

GitCat은 VS Code Extension 기반 로컬 실행형 모노레포이며, 일반적인 서버형 JVM/WAS 배포 구조가 아니다. 따라서 본 문서는 웹 애플리케이션 서버 배포가 아니라 VS Code Extension 설치, pnpm workspace 빌드, AI 모드 설정을 중심으로 설명한다.

## 2. 프로젝트 개요

- 프로젝트명: `GitCat`
- 실행 형태: `VS Code Extension`
- 저장소 구조: `pnpm workspace` 기반 모노레포
- 주요 실행 계층:
  - `apps/extension`: VS Code Extension Host
  - `apps/webview-ui`: Webview UI
  - `packages/*`: 공통 로직, 저장소, AI 파이프라인

## 3. 사용 기술 및 정확 버전

아래 버전은 최소 버전이 아니라 팀 실사용 exact 버전으로 최종 제출 전에 반드시 확정해야 한다.

| 구분 | 값 |
| --- | --- |
| Node.js | `실사용 버전 기입 필요 (예: v20.19.0)` |
| pnpm | `실사용 버전 기입 필요 (예: 9.15.0)` |
| VS Code | `실사용 버전 기입 필요` |
| TypeScript | `5.9.3` |
| React | `18.3.1` |
| Vite | `6.4.2` |
| SQLite 런타임 | `sql.js 1.14.1` |
| 로컬 AI 런타임 | `node-llama-cpp 3.18.1` |

추가 참고:
- 루트 `package.json`에는 `node >=18.0.0`, `pnpm >=8.0.0`가 선언되어 있으나, 제출 문서에는 exact version을 적는다.
- VS Code Extension 엔진 기준은 `^1.80.0`이다.

## 4. 저장소 클론 및 빌드 절차

### 4.1 저장소 클론

```bash
git clone <저장소 URL>
cd s14-final_S14P31B103
```

### 4.2 의존성 설치

프로젝트 루트에서 다음 명령을 실행한다.

```bash
pnpm install
```

### 4.3 전체 빌드

```bash
pnpm run build
```

### 4.4 VSIX 패키징

VSIX 파일이 필요한 경우 다음 명령을 실행한다.

```bash
pnpm --dir apps/extension run package:vsix
```

설명:
- 위 명령은 extension typecheck와 번들 빌드를 포함한다.
- 생성된 VSIX는 로컬 설치 또는 최종 시연용 패키지로 활용할 수 있다.

## 5. 실행 절차

### 5.1 VS Code Extension 실행

1. VS Code에서 프로젝트를 연다.
2. extension 개발 실행 또는 VSIX 설치를 수행한다.
3. Command Palette를 열어 `GitCat: Open Panel`을 실행한다.
4. GitCat 패널이 정상적으로 열리는지 확인한다.

### 5.2 VSIX 설치 방식

1. VS Code에서 Command Palette를 연다.
2. `Extensions: Install from VSIX...`를 실행한다.
3. 생성된 VSIX 파일을 선택한다.
4. 설치 후 VS Code를 reload 한다.

## 6. AI 모드 운영 기준

최종 제출 기준 AI 모드는 아래 두 가지만 포함한다.

| 모드 | 설명 | 준비물 |
| --- | --- | --- |
| `live-remote` | 원격 GMS API 호출 방식 | GMS API Key, base URL, 모델명 |
| `live-local` | 로컬 GGUF 모델 추론 방식 | GGUF 파일, 로컬 모델 경로, `GitCat: Install Local Runtime` |

참고:
- `mock` 모드는 내부 개발/테스트용이며, 본 제출 문서의 최종 사용자 운영 범위에서는 제외한다.

## 7. 환경 변수 및 설정 정보

루트 `.env` 파일 기준 환경 변수:

| 변수명 | 설명 | 비고 |
| --- | --- | --- |
| `GMS_KEY` | 원격 AI 호출용 API Key | `live-remote` 필수 |
| `GMS_MODEL` | 원격 AI 호출 모델명 | 실사용 값 기입 필요 |
| `GMS_BASE_URL` | GMS 게이트웨이 기본 URL | 기본 예시: `https://gms.ssafy.io/gmsapi/` |

관련 파일:
- `.env`
- `.env.example`

예시:

```env
GMS_KEY='YOUR_GMS_KEY'
GMS_MODEL='gpt-4.1-mini'
GMS_BASE_URL='https://gms.ssafy.io/gmsapi/'
```

## 8. 배포 및 실행 시 특이사항

### 8.1 `live-remote`

- 원격 AI 호출 시 `GMS_KEY`가 필요하다.
- 환경 변수에 키가 없으면 최초 AI 기능 실행 시 입력창이 표시될 수 있다.
- 입력한 키는 VS Code `SecretStorage`에 저장된다.

### 8.2 `live-local`

- Hugging Face에서 GGUF 모델 파일을 직접 다운로드해야 한다.
- VS Code 설정 `Gitcat > Ai: Local Model Path`에 모델 절대 경로를 입력해야 한다.
- Command Palette에서 `GitCat: Install Local Runtime`을 실행해 `node-llama-cpp` 로컬 런타임 설치가 필요할 수 있다.

### 8.3 로컬 저장 경로

GitCat은 서버형 DB 대신 로컬 저장소를 사용한다.

| 경로 | 용도 |
| --- | --- |
| `.vscode/gitcat/` | GitCat 로컬 저장소 루트 |
| `.vscode/gitcat/gitcat.db` | SQLite 메타데이터 DB |
| `.vscode/gitcat/snapshots/` | 스냅샷 파일 저장 |
| `.vscode/gitcat/merge-sessions/` | 병합 분석/AI 산출물 저장 |

## 9. 주요 설정 파일 및 프로퍼티 파일 목록

| 파일 | 용도 |
| --- | --- |
| `.env` | 실사용 환경 변수 |
| `.env.example` | 환경 변수 예시 |
| `package.json` | 루트 workspace 스크립트 및 엔진 |
| `pnpm-workspace.yaml` | workspace 패키지 구성 |
| `apps/extension/package.json` | extension 명령어, 설정값, VSIX 스크립트 |
| `apps/extension/src/storage/sql/schema.v1.sql` | SQLite 스키마 |

## 10. 설치 후 기본 확인 항목

1. `pnpm install`이 오류 없이 완료되는가
2. `pnpm run build`가 성공하는가
3. 필요 시 `pnpm --dir apps/extension run package:vsix`가 성공하는가
4. VS Code에서 `GitCat: Open Panel` 실행 시 패널이 정상 노출되는가
5. `live-remote` 또는 `live-local` 설정 후 AI 기능 호출이 정상 동작하는가

## 11. 최종 제출 전 추가 기입 필요 정보

- 팀 실사용 `node -v`
- 팀 실사용 `pnpm -v`
- 최종 시연 PC의 `VS Code 버전`
- `live-remote` 실제 모델명
- `live-local` 실제 GGUF 파일명 및 실제 저장 경로
