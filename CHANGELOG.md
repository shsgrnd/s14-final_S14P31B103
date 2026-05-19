# Release Notes

## Unreleased

## v0.0.8 - 2026-05-19

### Improved
- 새로 생성되는 AI 스냅샷 요약 제목이 GitCat 언어 설정(`auto`/`ko`/`en`)을 따르도록 개선했습니다.
- 기존 스냅샷 제목과 시스템 fallback/특수 스냅샷 제목은 그대로 유지하도록 언어 적용 범위를 정리했습니다.
- PR recommendation에서 template의 마크다운 섹션 heading 줄은 유지하되, heading이 아닌 본문/체크리스트/placeholder 문구는 GitCat 언어 설정을 따르도록 개선했습니다.
- README와 VSIX 설치 가이드를 `0.0.8` 패키징 기준으로 갱신했습니다.

## v0.0.6 - 2026-05-19

### Added
- Git 패널에 `changes → staging → commit → push` 진행 단계를 보여주는 워크플로 스텝퍼와 다음 액션 힌트를 추가했습니다.

### Improved
- 저장, 커밋, 푸시 이후 Git 상태 갱신 흐름을 보완해 패널과 파일 목록의 반영 시점을 더 안정화했습니다.
- 스냅샷 타임라인에서 요약명을 더 자연스럽게 표시하고 이름 수정 흐름을 인라인 편집 방식으로 개선했습니다.
- Marketplace / VSIX 배포 식별자를 `GitCat.gitcat-vscode` 기준으로 정리했습니다.
- VSIX 출력 파일명이 `gitcat-vscode-<version>.vsix` 형식을 따르도록 패키징 스크립트를 정리했습니다.
- README, 포팅 문서, 외부 서비스 문서를 `0.0.6` 패키징 기준으로 갱신했습니다.

### Notes
- 기존 `GitCat.gitcat` 설치본과는 별도 확장으로 취급될 수 있으므로 `live-local` 런타임과 VS Code `SecretStorage` 기반 토큰/API 키를 다시 설정해야 할 수 있습니다.

## v0.0.5 - 2026-05-19

### Improved
- PR recommendation이 template가 없을 때 제목과 본문을 한국어 기본값으로 생성하도록 개선했습니다.
- 영어 PR template를 사용하는 경우에는 template의 heading / placeholder 언어를 유지하도록 recommendation 언어 정책을 보완했습니다.
- VSIX 설치 가이드와 릴리즈 문서를 `0.0.5` 패키징 기준으로 정리했습니다.

### Fixed
- VSIX 설치본의 `live-local` 모드에서 local runtime이 이미 설치되어 있어도 번들 환경 때문에 로딩이 실패하던 문제를 수정했습니다.

## v0.0.4 - 2026-05-18

### Improved
- `live-local` 모드에서 Windows 형식의 GGUF 모델 경로를 WSL 환경에서도 자동으로 `/mnt/...` 경로로 변환하도록 보완했습니다.
- VSIX 배포 메타데이터와 설치 가이드를 `0.0.4` 패키징 기준으로 정리했습니다.

### Fixed
- 스냅샷 타임라인 디테일에서 아이콘을 제거하고 파일 변경 설명을 더 명확하게 다듬었습니다.
- 배포용 extension publisher 설정을 실제 배포 기준에 맞게 정리했습니다.

## v0.0.3 - 2026-05-18

### Added
- 병합 충돌 웹뷰 및 검토 패널을 추가했습니다.
- AI 병합 초안 확인 흐름을 추가했습니다.
- `GitCat: Install Local Runtime` 명령을 추가했습니다.
- `live-local`, `live-remote`, `mock` 모드 기반의 AI 실행 흐름을 정리했습니다.

### Improved
- 병합 충돌 발생 시 재시도 및 후속 진행 흐름을 보완했습니다.
- 병합 분석에 RAG 컨텍스트를 연결해 AI 분석 품질을 개선했습니다.
- VSIX 패키징 및 로컬 런타임 설치 흐름을 정비했습니다.
- 배포 및 실행 가이드를 README 기준으로 정리했습니다.

### Fixed
- develop 병합 이후 extension 재패키징 이슈를 수정했습니다.
- publisher 설정을 배포 기준에 맞게 정리했습니다.

## v0.0.2 - 2026-05-16

### Added
- 수동 스냅샷(savepoint) 저장 흐름을 추가했습니다.
- 대량 삭제 경고 및 위험 파일 감지 기능을 추가했습니다.
- 오픈소스 로컬 LLM 연동과 로컬 RAG 기반을 추가했습니다.
- GitHub API 기반 PR 생성 및 메타데이터 설정 흐름을 추가했습니다.

### Improved
- GitCat 웹뷰 UI와 브랜치 정리/파일 패널 UX를 개선했습니다.
- Git 상태 자동 새로고침과 파일 트리 조회 흐름을 보완했습니다.
- Merge 완료 및 충돌 발생 결과를 UI에서 더 빠르게 확인할 수 있도록 개선했습니다.
- No-Git 환경과 Stash 패널 사용 흐름을 정리했습니다.

### Fixed
- 세이브포인트(수동 스냅샷 저장) 관련 오류를 수정했습니다.
- 대량 삭제 경고 기준을 조정했습니다.

## v0.0.1 - 2026-04-29

### Added
- GitCat 웹뷰 및 사이드바 실행 기능을 추가했습니다.
- Git 상태 조회 기능을 추가했습니다.
- 브랜치 목록 확인 기능을 추가했습니다.
- 브랜치명 AI 추천 기능을 추가했습니다.
- 커밋 메시지 AI 추천 기능을 추가했습니다.
- PR 설명 AI 추천 기능을 추가했습니다.
- GitHub 토큰 등록 및 해제 기능을 추가했습니다.
- PR 생성 패널 실행 기능을 추가했습니다.
- 로컬 브랜치 정리 기능을 추가했습니다.

### Notes
- 팀 내부 테스트용 초기 배포본입니다.
