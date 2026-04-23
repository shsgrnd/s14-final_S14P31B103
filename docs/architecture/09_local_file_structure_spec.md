# 09.  로컬 파일 구조 정의서

# 로컬 파일 구조 정의서

## 문서 개요

본 문서는 GitCat MVP에서 로컬 파일 시스템에 저장되는 데이터의 디렉터리 구조와 파일 규약을 정의한다.

GitCat은 실제 스냅샷 파일 본문, 병합 초안 결과, 임시 작업 파일을 워크스페이스 내부 `.vscode/gitcat/` 하위에 저장한다.

---

## 최상위 디렉터리 구조

```
.vscode/
  gitcat/
    snapshots/
    merge-sessions/
    temp/
```

| 디렉터리 | 설명 |
| --- | --- |
| `.vscode/gitcat/snapshots/` | 스냅샷별 원본 파일 복사본 및 메타데이터 저장 |
| `.vscode/gitcat/merge-sessions/` | 병합 세션 결과, 충돌 분석 요약, 병합 초안 저장 |
| `.vscode/gitcat/temp/` | 임시 비교/전처리/분석용 파일 저장 |

---

## 1. snapshots 디렉터리

### 역할

AI 작업 세션 또는 수동 편집 세션 종료 시 확정된 스냅샷 파일을 저장한다.

### 구조

```
.vscode/gitcat/snapshots/
  {snapshotId}/
    metadata.json
    summary.json
    originals/
      src__auth__user.ts
      src__components__Login.tsx
```

### 구성 요소

### 1) `{snapshotId}/`

- 하나의 스냅샷을 나타내는 디렉터리
- 디렉터리명은 `snapshotId` 사용

### 2) `metadata.json`

- 스냅샷 메타데이터 파일
- 생성 시각, reason, 브랜치명, 세션 연결 정보, 체크포인트 여부 저장

### 3) `summary.json`

- 스냅샷 요약 정보 파일
- 변경 파일 목록, 변경 수, 간단한 설명, UI 표시용 요약 정보 저장

### 4) `originals/`

- 해당 스냅샷 시점의 실제 파일 복사본 저장
- 원복 시 실제 복원 대상이 되는 파일들

---

## metadata.json 정의

### 예시

```json
{
  "snapshotId": "snap_20260420_001",
  "sessionId": "sess_20260420_001",
  "createdAt": 1714000000000,
  "reason": "ai_work",
  "branchName": "feature/login",
  "isCheckpoint": false,
  "label": null
}
```

### 필드 설명

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| snapshotId | string | 스냅샷 고유 식별자 |
| sessionId | string | null | 연결된 세션 ID |
| createdAt | number | 생성 시각 (Unix ms) |
| reason | string | 생성 이유 (`ai_work`, `manual`, `pre_restore`, `pre_merge`) |
| branchName | string | 생성 시점 활성 브랜치명 |
| isCheckpoint | boolean | 체크포인트 여부 |
| label | string | null | 사용자 지정 이름 |

---

## summary.json 정의

### 예시

```json
{
  "fileCount": 3,
  "files": [
    "src/auth/user.ts",
    "src/auth/login.ts",
    "src/components/Login.tsx"
  ],
  "description": "AI 작업 세션 종료 후 통합 스냅샷",
  "sessionType": "ai_work"
}
```

### 필드 설명

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| fileCount | number | 포함된 파일 수 |
| files | string[] | 원본 파일 경로 목록 |
| description | string | UI 표시용 요약 설명 |
| sessionType | string | 세션 유형 (`ai_work`, `manual`) |

---

## originals 파일명 규칙

실제 원본 파일은 디렉터리 구분자를 `__`로 치환한 파일명으로 저장한다.

### 예시

- `src/auth/user.ts` → `src__auth__user.ts`
- `src/components/Login.tsx` → `src__components__Login.tsx`

### 목적

- 하나의 디렉터리에 평탄화 저장 가능
- 파일 시스템에서 안전하게 저장 가능
- 원복 시 summary/files 정보와 매핑 가능

---

## 2. merge-sessions 디렉터리

### 역할

병합 분석 및 AI 병합 초안 관련 파일을 저장한다.

### 구조

```
.vscode/gitcat/merge-sessions/
  {mergeSessionId}/
    analysis.json
    proposals.json
    summary.json
```

### 구성 요소

### 1) `analysis.json`

- 병합 분석 결과 저장
- source/target 브랜치, 분석 시각, 충돌 후보 요약 포함

### 2) `proposals.json`

- AI 병합 초안 결과 저장
- 파일별 제안 코드, 설명, confidence 포함

### 3) `summary.json`

- UI 표시용 병합 세션 요약 정보 저장

---

## analysis.json 정의

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| mergeSessionId | string | 병합 세션 ID |
| sourceBranch | string | 병합 대상 브랜치 |
| targetBranch | string | 기준 브랜치 |
| analyzedAt | number | 분석 시각 |
| candidateCount | number | 충돌 후보 수 |

---

## proposals.json 정의

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| filePath | string | 대상 파일 경로 |
| proposedCode | string | AI 제안 코드 |
| explanation | string | AI 설명 |
| confidence | string | 신뢰도 |

---

## 3. temp 디렉터리

### 역할

일시적인 비교/전처리/분석 중간 산출물을 저장한다.

### 구조

```
.vscode/gitcat/temp/
  compare/
  diff/
  prompt/
```

### 원칙

- 영속 보관 대상 아님
- 세션 종료 또는 작업 완료 시 정리 가능
- 장애 발생 시에도 핵심 복원 데이터로 사용하지 않음

---

## 생성 규칙

### 스냅샷 생성 시

- `snapshots/{snapshotId}/` 생성
- `metadata.json` 작성
- `summary.json` 작성
- `originals/` 하위에 원본 파일 복사본 저장

### 병합 분석 시

- `merge-sessions/{mergeSessionId}/analysis.json` 저장
- 필요 시 `proposals.json` 저장

### 임시 작업 시

- `temp/` 하위에 임시 파일 저장
- 작업 종료 후 삭제 가능

---

## 조회 규칙

### 스냅샷 목록 조회

- 목록 자체는 SQLite 메타데이터 기준으로 조회
- 사용자가 특정 스냅샷 클릭 시 해당 디렉터리의 `metadata.json`, `summary.json` 읽기

### 원복 시

- SQLite에서 파일 목록 조회
- `originals/` 하위 파일 복사본 읽기
- 워크스페이스 원본 위치에 복원

### 병합 초안 조회

- SQLite 메타데이터 또는 병합 세션 ID 기반으로 디렉터리 찾기
- `analysis.json`, `proposals.json` 로드

---

## 삭제/정리 규칙

### 일반 스냅샷

- 보관 개수 초과 시 오래된 순으로 삭제 가능
- 단, 체크포인트는 자동 삭제 대상에서 제외

### 체크포인트 스냅샷

- 사용자 명시적 해제 또는 삭제 요청이 있을 때만 삭제

### 임시 파일

- 작업 종료 후 정리 가능
- 장기 보관 대상 아님

---

## Git 추적 규칙

`.vscode/gitcat/` 하위 파일은 Git 추적 대상에서 제외한다.

### 예시

```
.vscode/gitcat/
```

### 이유

- 스냅샷 파일은 로컬 복원용 데이터임
- 실제 프로젝트 소스와 별개임
- 팀원 간 공유 대상이 아님

---

## 결론

로컬 파일 시스템은 GitCat에서 실제 복원 가능한 파일 본문을 저장하는 핵심 저장소다.

스냅샷은 `snapshots/`, 병합 분석 결과는 `merge-sessions/`, 임시 중간 산출물은 `temp/`에 저장하며, 각 파일은 메타데이터와 실제 원본을 분리해 관리한다.

원하면 다음엔 이어서 **SQLite 기준 ERD에 들어갈 엔티티 텍스트 정의**도 같은 방식으로 적어줄게.