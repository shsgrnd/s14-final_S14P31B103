# GitCat MVP 프로젝트 개요

## 프로젝트 성격
- 로컬 기반 VS Code Extension
- 서버 없음
- 현재 단계는 동기화 없는 로컬 MVP
- 추후 서버/동기화 확장 가능성을 고려하되, 현재 구현은 로컬 단일 사용자 중심

## 핵심 기능 그룹

### 1. 깃 작업
- GUI 기반 Git 명령 실행
- 브랜치명 추천 / 수정 / 적용
- 커밋 메시지 추천 / 수정 / 적용
- PR description 추천 / 수정 / 복사
- 브랜치 목록 조회 / 자동 삭제 / 일괄 삭제 / 삭제 전 경고

### 2. Safety Layer
- AI 작업 세션 시작
- 수동 편집 세션 시작
- 세션별 변경 파일 추적
- 파일별 최초 변경 전 상태 저장
- 세션 종료 시 통합 스냅샷 생성
- 체크포인트 지정
- 스냅샷 목록 / 상세 조회
- 원복 및 원복 이력 조회
- 대량 삭제 / 위험 파일 변경 감지

### 3. 병합 관리
- 병합 대상 브랜치 선택
- 병합 전 충돌 후보 분석
- 충돌 후보 목록 조회
- AI 병합 코드 생성
- AI 병합 설명 생성
- 파일별 병합안 검토
- 병합안 수락 / 거절
- 병합 가능 여부 재판단
- 병합 실행

## 기술 스택
- VS Code Extension + TypeScript
- Webview UI + Extension Host 구조
- SQLite: 관계형 메타데이터 저장
- 로컬 파일 시스템: 실제 스냅샷 파일, 병합 분석 산출물, 병합 제안 산출물 저장
- VS Code Secrets: 사용자 AI API Key 저장
- Git CLI 또는 wrapper 기반 Git 제어

## 현재 도메인 중심 구조
- User
- Device
- Project
- ProjectWorkspace
- Branch
- Worktree
- WorktreeInstance
- WorkSession
- Snapshot
- SnapshotFile
- ChangeRecord
- ChangedFile
- RestoreHistory
- MergeAnalysis
- ConflictCandidate
- MergeProposal
- ProposalFeedback
- RecommendationHistory

## 현재 실행 단위
- 프로젝트(Project)는 논리 프로젝트 단위다.
- 프로젝트는 여러 브랜치와 워크트리를 가진다.
- WorktreeInstance는 실제 작업에 사용되는 브랜치-워크트리 연결 단위다.
- WorkSession은 특정 WorktreeInstance를 기준으로 생성된다.
- Snapshot과 ChangeRecord는 WorkSession 하위 결과물이다.
- MergeAnalysis는 source/target 두 WorktreeInstance를 비교하는 작업 단위다.

## 저장 구조 원칙
- SQLite에는 조회/정렬/관계 추적이 필요한 메타데이터를 저장한다.
- 실제 스냅샷 파일 본문은 로컬 파일 시스템에 저장한다.
- 병합 분석 산출물과 병합 제안 산출물의 큰 본문 데이터도 로컬 파일 시스템에 저장한다.
- API Key는 VS Code Secrets에 저장한다.

## AI 이력 활용 원칙
- recommendation_histories는 커밋명/브랜치명/PR 설명 추천 시 이전 추천 결과를 참고하기 위한 이력 테이블이다.
- proposal_feedbacks는 병합 제안의 선택 결과와 최종 수정 결과를 저장해 이후 병합 AI가 참고할 수 있는 학습/참고 이력 테이블이다.
- 즉 AI 기능은 단발 추천이 아니라, 이전 제안/선택/수정 결과를 누적 참고하는 구조를 전제로 한다.