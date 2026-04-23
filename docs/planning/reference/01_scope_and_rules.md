# 구현 범위 및 제약조건

## 현재 구현 범위
- 로컬 MVP만 구현
- 서버 없음
- 동기화 없음
- 중앙 인증/권한 없음
- 배포/운영 환경 없음

## 현재 설계 우선순위
1. 최종 내부 인터페이스 CSV
2. 최종 ERD
3. 최종 기능명세서

## 내부 인터페이스 문서 사용 규칙
- docs/02_message_protocol.csv:
  - 인터페이스 분류가 MESSAGE인 행만 포함
- docs/03_internal_interfaces.csv:
  - Module API / VS Code Integration / STORAGE / Type-Schema 행 포함
- 구현 시 인터페이스 시그니처, 메시지 type, 실패 조건, 선행 조건은 이 CSV를 우선 기준으로 삼는다.

## 저장 구조 원칙
- SQLite는 관계형 메타데이터의 source of truth로 사용한다.
- 로컬 파일 시스템은 실제 스냅샷 원본 파일, 병합 분석 산출물, 병합 제안 산출물의 source of truth다.
- VS Code Secrets는 사용자 AI API Key 저장소로 사용한다.
- globalState는 source of truth로 사용하지 않고, 아주 가벼운 확장 로컬 캐시/상태에만 제한한다.

## 현재 ERD 기준 구현 규칙
- WorkSession은 WorktreeInstance를 기준으로 생성한다.
- Snapshot은 Session 하위 결과물이다.
- ChangeRecord도 Session 하위 결과물이다.
- SnapshotFile은 실제 원본 파일 복사본의 경로와 해시만 DB에 저장한다.
- MergeAnalysis는 source/target 두 WorktreeInstance 비교를 기준으로 생성한다.
- ConflictCandidate와 MergeProposal은 MergeAnalysis 하위 결과물이다.
- proposal_feedbacks는 병합 제안 선택/수정 결과를 저장하는 AI 참고 이력이다.
- recommendation_histories는 일반 추천 이력을 저장하는 AI 참고 이력이다.

## AI 이력 활용 규칙
- AI 추천/병합 제안 생성 시 이전 이력 조회는 가능해야 한다.
- recommendation_histories는 추천 생성 입력의 참고 자료로 사용 가능하다.
- proposal_feedbacks는 병합 제안 생성 입력의 참고 자료로 사용 가능하다.
- 단, 이전 이력은 참고용이며 source of truth는 현재 Git 상태와 현재 세션/병합 분석 결과다.

## 현재 MVP에서 하지 않을 것
- 서버 API
- 여러 기기 동기화
- 사용자 간 공유
- 중앙 DB
- 실시간 협업
- 세밀한 권한 제어
- 상용 수준 UI polishing

## 구현 원칙
- VS Code API, 도메인 로직, 저장소 계층을 분리한다.
- Git은 재구현하지 않는다.
- 세이프티 레이어는 세션 단위로 동작한다.
- 저장 이벤트마다 스냅샷을 생성하지 않는다.
- UI는 최소 연결만 한다.
- AI provider는 실제 구현보다 인터페이스 안정화를 우선한다.
- 현재 단계 범위를 넘는 기능은 구조만 고려하고 구현하지 않는다.