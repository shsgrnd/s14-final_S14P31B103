# 10. 파일 저장 규약 / 보안 저장소 규약

# 파일 저장 규약

GitCat은 AI 작업 실행 직전 자동 스냅샷을 생성하고, 필요 시 해당 시점으로 원복할 수 있도록 실제 파일 복사본을 로컬 파일 시스템에 저장한다. 스냅샷은 관계형 조회 대상이 아닌 **복구용 원본 데이터**이므로, SQLite가 아니라 워크스페이스 내부 파일 시스템에 별도 저장한다. 자동 스냅샷은 AI 작업 실행 직전 생성되고, 원복은 해당 AI 작업 직전 상태를 기준으로 수행된다.

## 1. 저장 위치

스냅샷 파일은 워크스페이스 루트 아래의 전용 폴더에 저장한다.

```
.vscode/gitcat/snapshots/{snapshotId}/
```

프로젝트 내 Git 추적 대상에서 제외해야 하므로, 해당 경로는 `.gitignore`에 자동 추가한다. 기존 내부 문서의 `.vscode/snapshots/` 구조를 GitCat 전용 경로로 확장해 사용한다.

## 2. 디렉터리 구조

각 스냅샷은 `snapshotId` 단위 디렉터리를 가지며, 내부에는 메타데이터 파일과 실제 복구용 파일 복사본을 저장한다.

```
.vscode/gitcat/
  gitcat.db
  snapshots/
    {snapshotId}/
      metadata.json
      originals/
        src__auth__login.ts
        src__components__Login.tsx
```

필요 시 `summary.json`, `diff.txt` 같은 보조 파일을 추가할 수 있으나, MVP에서는 `metadata.json`과 `originals/`만 필수로 둔다.

## 3. 파일명 변환 규칙

원본 파일 경로의 `/`, `\`는 `__`로 치환하여 저장 파일명으로 사용한다.

예:

- `src/auth/user.ts` → `src__auth__user.ts`
- `src/components/Login.tsx` → `src__components__Login.tsx`

이 규칙은 원본 경로를 파일 시스템에서 안전하게 표현하기 위한 것이다.

## 4. metadata.json 규약

각 스냅샷 디렉터리의 `metadata.json`에는 스냅샷 메타데이터를 저장한다.

```
{
  "snapshotId":"uuid-v4-string",
  "createdAt":1714000000000,
  "reason":"ai_work",
  "files": [
"src/auth.ts",
"src/user.ts"
  ],
  "branchName":"feature/login",
  "sessionId":"session-uuid",
  "isCheckpoint":false,
  "label":null
}
```

### 필드 설명

- `snapshotId`: 스냅샷 고유 ID
- `createdAt`: 생성 시각, Unix ms
- `reason`: 생성 사유 (`ai_work`, `manual`, `pre_restore`, `pre_merge`)
- `files`: 복사된 원본 파일 경로 목록
- `branchName`: 생성 시점 브랜치명
- `sessionId`: 연결된 세션 ID
- `isCheckpoint`: 체크포인트 여부
- `label`: 사용자 지정 이름

이 구조는 내부 명세서의 `metadata.json` 스키마를 따른다.

## 5. 저장 대상

파일 시스템에는 다음 데이터만 저장한다.

- 스냅샷 시점의 실제 파일 복사본
- 스냅샷 메타데이터 파일
- 필요 시 복구 보조용 diff 원문
- 필요 시 AI 응답 원문 백업

반면, 스냅샷 간 관계나 조회용 메타데이터는 SQLite에 저장한다.

## 6. 저장 목적

파일 시스템 저장의 목적은 **실제 원복 가능성 확보**이다.

스냅샷은 단순 목록 관리가 아니라, 특정 시점의 파일 내용을 그대로 복원하기 위한 복구 수단이므로 파일 본문 저장이 필수적이다. GitCat의 핵심 기능도 AI 작업 실행 직전 자동 스냅샷과 원복 지원에 초점이 맞춰져 있다.

---

# 보안 저장소 규약

GitCat은 로컬 환경에서 동작하는 VSCode Extension이므로, 사용자 설정과 민감 정보는 VSCode가 제공하는 저장소를 활용해 분리 저장한다. 일반 설정 및 상태값은 `globalState` 또는 `workspaceState`에 저장하고, API Key와 같은 민감 정보는 `SecretStorage`에 저장한다. 기존 내부 문서에서도 `globalState`는 key-value 저장소로 사용되며, 설정값과 활성 세션 정보 등을 저장하도록 정의되어 있다.

## 1. 저장소 구분

VSCode Storage는 다음 두 범주로 구분한다.

### 1) 일반 저장소

- `ExtensionContext.globalState`
- 필요 시 `workspaceState`

저장 대상:

- 최대 스냅샷 개수
- 스냅샷 타이머 시간
- 위험 파일 패턴
- 현재 활성 세션 ID
- 최근 선택 브랜치
- UI 상태 값

예시 키:

- `gitcat:settings:snapshotMax`
- `gitcat:settings:timerMs`
- `gitcat:settings:dangerPatterns`
- `gitcat:session:activeId`
- `gitcat:ui:lastSelectedBranch`

이 값들은 크기가 작고, 보안 민감도가 낮으며, 빠른 조회가 필요한 상태값이다. 내부 문서의 `settings:snapshotMax`, `settings:timerMs`, `settings:dangerPatterns`, `sessions:active` 규약을 GitCat 네임스페이스로 확장해 사용한다.

### 2) 비밀 저장소

- `ExtensionContext.secrets` (`SecretStorage`)

저장 대상:

- AI API Key
- 향후 외부 연동 토큰
- 사용자 인증 비밀값

예시 키:

- `gitcat:secret:aiApiKey`

민감 정보는 일반 key-value 저장소에 저장하지 않고, 반드시 SecretStorage에 저장한다.

## 2. 저장 원칙

보안 저장소는 다음 원칙을 따른다.

- 일반 설정값과 비밀값을 분리 저장한다.
- API Key는 SQLite나 파일 시스템에 저장하지 않는다.
- 민감 정보는 로그나 에러 메시지에 출력하지 않는다.
- UI에는 전체 키를 노출하지 않고 일부 마스킹한다.
- 비밀값이 없을 경우에만 사용자 입력을 요청한다.

## 3. 접근 규칙

- 설정값은 Extension 초기화 시 로드할 수 있다.
- 비밀값은 실제 AI 호출 직전에만 조회한다.
- 비밀값 수정 시 기존 값을 덮어쓴다.
- 비밀값 삭제 시 연결 기능도 비활성화한다.

## 4. 저장 목적

이 규약의 목적은 설정 데이터와 민감 정보를 분리하여, 로컬 환경에서도 최소한의 보안 기준을 유지하는 것이다. GitCat은 AI 기반 추천, 병합 초안 생성, 충돌 분석 보조 기능을 포함하므로, 외부 AI 연동 시 API Key 관리 규약이 필요하다. 또한 설정값과 활성 세션 정보는 빠른 상태 복원에 필요하므로 VSCode 저장소 활용이 적합하다.