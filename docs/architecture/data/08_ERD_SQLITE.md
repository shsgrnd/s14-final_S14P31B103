# 08. ERD (SQLITE)

https://www.erdcloud.com/d/bXpT2Rh3nyZLdNXSg

# ERD

![ERD.png](ERD.png)

---

# 데이터 저장 구조

GitCat은 로컬 환경에서 동작하는 VSCode Extension이므로, 데이터 특성에 따라 저장소를 분리하여 사용한다.

모든 데이터를 하나의 저장소에 저장하지 않고, **관계형 메타데이터**, **실제 복구용 파일**, **설정 및 상태 정보**를 각각 적절한 저장소에 배치한다.

저장 구조는 다음 3개 계층으로 구성된다.

- **SQLite**: 조회, 정렬, 검색, 이력 관리가 필요한 메타데이터 저장
- **로컬 파일 시스템**: 스냅샷 시점의 실제 파일 복사본 저장
- **VSCode Storage**: 설정값, 현재 상태, 비밀값 저장

이 구조를 통해 SQLite는 관계형 데이터 관리에 집중하고, 파일 시스템은 실제 복구 데이터를 보관하며, VSCode Storage는 가벼운 설정과 상태 유지 역할을 담당한다.

---

## 1. SQLite

SQLite는 GitCat의 **핵심 메타데이터 저장소**이다.

스냅샷, 세션, 변경 기록, 원복 이력, 병합 분석, 충돌 후보, AI 병합 초안, 추천 이력처럼 **서로 관계가 있는 데이터**를 저장한다.

### 저장 대상

- 프로젝트 정보
- 세션 정보
- 스냅샷 메타데이터
- 스냅샷 포함 파일 목록
- 변경 기록
- 변경 파일 목록
- 원복 이력
- 병합 분석 이력
- 충돌 후보
- 병합 초안
- 추천 결과 이력
- 설정값

### 역할

- 관계형 데이터 관리
- 조건 검색 및 정렬
- 세션/스냅샷/변경 기록 간 관계 유지
- 기능 이력 추적

---

## 2. 로컬 파일 시스템

로컬 파일 시스템은 GitCat의 **실제 복구용 데이터 저장소**이다.

스냅샷 시점의 파일 원본과 같이, 실제 원복에 필요한 데이터를 저장한다.

### 저장 대상

- 스냅샷 파일 복사본
- snapshot별 `metadata.json`
- 필요 시 diff 원문
- 필요 시 AI 응답 원문 백업

### 예시 경로

- `.vscode/gitcat/snapshots/{snapshotId}/`
- `.vscode/gitcat/snapshots/{snapshotId}/metadata.json`

### 역할

- 원복 시 실제 파일 내용 복구
- 스냅샷 단위 파일 보관
- 대용량 원문 데이터 저장

---

## 3. VSCode Storage

VSCode Storage는 GitCat의 **설정 및 상태 저장소**이다.

크기가 작고 즉시 조회가 필요한 값만 저장한다.

### 저장 대상

- 최대 스냅샷 개수
- 스냅샷 타이머 시간
- 위험 파일 패턴
- 현재 활성 세션 ID
- 최근 선택 브랜치
- UI 상태 값
- AI API Key 등 민감 정보

### 역할

- key-value 기반 빠른 조회
- 확장 프로그램 설정 유지
- 현재 상태 관리
- 민감 정보 보관

### 내부 구분

- **globalState / workspaceState**: 일반 설정값, 상태값
- **SecretStorage**: API Key 등 민감 정보

구조도에서는 하나의 **VSCode Storage**로 표현하되, 내부적으로 일반 저장과 비밀값 저장을 구분한다.

---

## 저장 구조 요약

GitCat의 전체 저장 구조는 다음과 같다.

- **SQLite**: 관계형 메타데이터
- **로컬 파일 시스템**: 실제 스냅샷 파일 본문
- **VSCode Storage**: 설정값, 상태값, 비밀값

즉, GitCat은 저장소별 역할을 명확히 분리하여,

메타데이터는 SQLite에, 실제 복구 파일은 로컬 파일 시스템에, 설정과 상태 정보는 VSCode Storage에 저장하도록 설계한다.

---

# SQLite ERD 설명

SQLite ERD에는 **관계형으로 조회·검색·정렬할 메타데이터**만 포함한다.

실제 코드 파일 복사본, diff 원문, snapshot 폴더 구조, API Key 등은 ERD 대상이 아니며, 파일 저장 규약 또는 VSCode Storage 규약에서 별도로 다룬다.

## ERD 포함 엔티티

- Project
- Session
- Snapshot
- SnapshotFile
- ChangeRecord
- ChangedFile
- RestoreHistory
- MergeAnalysis
- ConflictCandidate
- MergeProposal
- RecommendationHistory
- AppSetting