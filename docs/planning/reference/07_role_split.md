# 역할 분담

## 프론트 담당
- Webview UI
- 상태 렌더링
- 버튼/입력 처리
- postMessage 송신/수신 연결

## AI 담당
- AI provider 실제 호출
- 프롬프트 작성
- 입력 전처리
- 출력 파싱
- 추천 결과 포맷 정리
- 이전 이력(recommendation_histories, proposal_feedbacks) 참고 전략 설계

## 현재 구현 담당
- Git 제어 로직
- SQLite 저장소
- 로컬 파일 저장소
- Session / Snapshot / Restore / Checkpoint
- MergeAnalysis / ConflictCandidate / MergeProposal 저장 흐름
- ProposalFeedback / RecommendationHistory 저장 흐름
- 메시지 라우팅
- 타입 및 서비스 계층 분리

## 공통 규칙
- Webview ↔ Extension 메시지 규약은 docs/02_message_protocol.csv 기준
- 내부 서비스 인터페이스는 docs/03_internal_interfaces.csv 기준
- 프론트/AI 담당이 쉽게 연결할 수 있도록 DTO와 인터페이스를 먼저 안정화한다
- AI는 현재 Git 상태/세션/병합 분석 결과를 우선 참고하고, 과거 이력은 보조 참고 자료로만 사용한다