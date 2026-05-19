# GitCat 외부 서비스 정보 정리

## 1. 문서 개요

본 문서는 GitCat 프로젝트에서 사용하는 외부 서비스와 해당 서비스 이용에 필요한 정보들을 정리한 문서이다.

최종 제출 기준 운영 대상은 `live-remote`, `live-local` 두 모드이며, 이에 필요한 외부 서비스 중심으로 정리한다.

## 2. GMS API

### 2.1 용도

- `live-remote` 모드에서 AI 추천 및 분석 요청 수행
- 원격 모델 호출 시 gateway 역할 수행

### 2.2 필요 정보

| 항목 | 내용 |
| --- | --- |
| API Key | `GMS_KEY` |
| Base URL | `GMS_BASE_URL` |
| Model | `GMS_MODEL` |
| 저장 위치 | 환경 변수 또는 최초 실행 후 VS Code `SecretStorage` |

### 2.3 현재 기준값

| 항목 | 값 |
| --- | --- |
| 기본 Base URL 예시 | `사용자 정의` |
| 모델명 | `gpt-4.1-mini` |
| 키 발급 방식 | `사용자 정의` |

### 2.4 포팅 시 준비 절차

1. GMS API Key를 발급받는다.
2. 루트 `.env` 또는 실행 환경에 `GMS_KEY`를 설정한다.
3. 필요 시 `GMS_MODEL`, `GMS_BASE_URL`을 설정한다.
4. VS Code에서 GitCat AI 기능을 실행해 연결을 확인한다.

## 3. Hugging Face

### 3.1 용도

- `live-local` 모드에서 사용할 GGUF 모델 파일 다운로드

### 3.2 저장소 정보

| 항목 | 값 |
| --- | --- |
| 서비스 | Hugging Face |
| 저장소 | `shsgrnd/SSAFY_gitcat-local-llm` |
| URL | `https://huggingface.co/shsgrnd/SSAFY_gitcat-local-llm` |

### 3.3 권장 파일

- `gitcat-v3-sft-merged-Q4_K_M.gguf`
- `gitcat-v3-dpo-merged-Q4_K_M.gguf`

### 3.4 최종 제출 전 기입 필요

| 항목 | 내용 |
| --- | --- |
| 실제 사용 파일명 | `gitcat-v3-sft-merged-Q4_K_M.gguf` |
| 실제 저장 경로 | `사용자 정의` |
| 시연 시 사용 모델 | ``gitcat-v3-sft-merged-Q4_K_M.gguf`` |

### 3.5 포팅 시 준비 절차

1. Hugging Face 저장소에서 GGUF 파일을 다운로드한다.
2. 파일을 로컬 PC에 저장한다.
3. VS Code 설정 `Gitcat > Ai: Local Model Path`에 절대 경로를 입력한다.
4. `GitCat: Install Local Runtime` 실행 후 로컬 추론 가능 여부를 확인한다.

## 4. GitHub

### 4.1 용도

- PR 관련 기능
- GitHub remote URL 기반 저장소 정보 파싱
- GitHub Token을 통한 PR 생성/조회 보조 기능

### 4.2 필요 정보

| 항목 | 내용 |
| --- | --- |
| Personal Access Token | GitHub Token |
| 저장 명령 | `GitCat: Set GitHub Token` |
| 삭제 명령 | `GitCat: Clear GitHub Token` |
| 저장 위치 | VS Code `SecretStorage` |

### 4.3 권한 범위

- `실사용 GitHub PAT 권한 범위 기입 필요`
- 일반적으로 private 저장소 포함 PR 기능을 쓸 경우 repo 계열 권한 검토가 필요하다.

### 4.4 포팅 시 준비 절차

1. GitHub에서 Personal Access Token을 발급한다.
2. VS Code Command Palette에서 `GitCat: Set GitHub Token`을 실행한다.
3. 토큰 입력 후 PR 관련 기능이 정상 동작하는지 확인한다.

## 5. VSIX / VS Code Marketplace

### 5.1 용도

- 최종 사용자 설치 경로
- 시연 및 배포 패키지 제공 방식

### 5.2 설치 방식

| 방식 | 설명 |
| --- | --- |
| VSIX 직접 설치 | 로컬 생성 또는 배포본 `.vsix` 파일 설치 |
| Marketplace 설치 | 배포 후 VS Code Marketplace를 통한 설치 |

### 5.3 본 프로젝트 기준 패키징

```bash
pnpm --dir apps/extension run package:vsix
```

### 5.4 최종 제출 전 기입 필요

| 항목 | 내용 |
| --- | --- |
| 시연 설치 방식 | VSIX / Marketplace 중 택1 |
| 최종 사용 VSIX 파일명 | gitcat-0.0.5.visx |
| 배포 위치 | Marketplace |

## 6. 서비스별 체크리스트

| 서비스 | 확인 항목 |
| --- | --- |
| GMS API | Key, Base URL, Model 설정 완료 여부 |
| Hugging Face | GGUF 다운로드 및 경로 설정 여부 |
| GitHub | Token 저장 및 PR 기능 동작 여부 |
| VSIX / Marketplace | 실제 설치 경로와 시연 방식 확정 여부 |

## 7. 최종 제출 전 추가 기입 필요 정보

- GMS API Key 발급 방법
- `live-remote` 실제 모델명
- `live-local` 실제 GGUF 파일명 및 저장 경로
- GitHub PAT 권한 범위
- 최종 시연 설치 방식
