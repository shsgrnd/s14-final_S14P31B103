# GitCat Webview UI

이 패키지는 GitCat 사용자가 VS Code 내부에서 보게 될 **화면(UI)**을 담당하는 프론트엔드 프로젝트입니다.
브라우저 환경에서 동작하며, React, Vue, Svelte 등의 프레임워크를 기반으로 작성됩니다.

## 주요 역할
- **UI 컴포넌트 렌더링 (`src/components/`)**: 충돌 내역 표시, 병합 제안, 커밋 메시지 추천 등의 화면 렌더링
- **익스텐션 통신 (`src/hooks/`)**: Extension Host(`apps/extension`)와의 메시지 교환을 담당하는 커스텀 훅 및 상태 관리

## 참고 사항
- 본 프로젝트는 순수 UI의 렌더링만 책임지며, 로컬 파일 시스템 제어나 로컬 터미널 명령 등의 권한은 Extension Host에게 요청(Message)해야 합니다.
