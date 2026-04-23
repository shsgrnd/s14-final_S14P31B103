# 로컬 파일 구조 정의서

## 문서 목적
현재 목표 구조 기준으로 로컬 파일 시스템에는
- 실제 스냅샷 원본 파일 복사본
- 병합 분석 산출물
- 병합 제안 산출물
- 임시 작업 파일
을 저장한다.

---

## 최상위 디렉터리

~~~text
.vscode/
  gitcat/
    snapshots/
    merge-sessions/
    temp/
~~~

---

## 1. snapshots 디렉터리

### 역할
원복 가능한 실제 스냅샷 파일 복사본 저장

### 경로 구조

~~~text
.vscode/gitcat/snapshots/{snapshotId}/
  metadata.json
  summary.json
  originals/
    src__auth__user.ts
    src__components__Login.tsx
~~~

### 설명
- `{snapshotId}`: `snapshots.snapshot_id` 와 1:1 대응
- `metadata.json`: 로컬 스냅샷 메타 보조 파일
- `summary.json`: UI/복원 보조 요약 파일
- `originals/`: 해당 스냅샷에 포함된 실제 파일 복사본 저장
- 각 파일의 관계형 메타데이터는 DB의 `snapshot_files` 테이블이 담당

---

## 2. merge-sessions 디렉터리

### 역할
병합 분석과 병합 제안의 큰 본문 산출물 저장

### 경로 구조

~~~text
.vscode/gitcat/merge-sessions/{analysisId}/
  analysis.json
  proposals.json
  summary.json
~~~

### analysis.json
저장 대상 예:
- `analysis_id`
- `source_worktree_instance_id`
- `target_worktree_instance_id`
- `merge_base`
- conflict candidate 상세 목록
- `file_path`
- `line_start`
- `line_end`
- conflict code excerpt
- `detected_by`
- 필요 시 confidence 상세

### proposals.json
저장 대상 예:
- `proposal_id`
- `candidate_id`
- `ai_request_id`
- `feature_type`
- proposed code 본문
- 긴 explanation 원문
- `confidence_score`
- `validation_required`
- `validation_summary`
- `status`

### summary.json
저장 대상 예:
- 분석 요약
- 후보 개수
- 제안 개수
- source/target 표시용 요약 정보

---

## 3. temp 디렉터리

### 역할
임시 비교/전처리/분석 파일 저장

### 경로 구조

~~~text
.vscode/gitcat/temp/
  compare/
  diff/
  prompt/
~~~

### 설명
- 영속 보관 대상 아님
- 작업 종료 후 삭제 가능
- source of truth 아님

---

## 4. 파일명 규칙

원본 파일 경로의 경로 구분자는 `__` 로 치환한다.

### 예시
- `src/auth/user.ts` → `src__auth__user.ts`
- `src/components/Login.tsx` → `src__components__Login.tsx`

---

## 5. Git 추적 규칙

~~~gitignore
.vscode/gitcat/
~~~

### 이유
- 로컬 원복용 데이터
- 병합 분석/제안 로컬 산출물
- 팀 공유 대상 아님