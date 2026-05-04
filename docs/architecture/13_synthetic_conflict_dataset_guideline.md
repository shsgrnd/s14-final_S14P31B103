# 📚 임의 충돌 데이터셋(Synthetic Conflict Dataset) 포맷 가이드라인

이 문서는 AI 병합 초안 파이프라인(SFT/DPO) 학습 전, 초기 베이스라인 검증 및 모델 파인튜닝(미세조정)에 사용될 **임의 충돌 데이터셋의 구성 기준과 작업 방식**을 정의하는 공식 기준서입니다. 

---

## 1. 목적 및 원칙
- **목적:** SFT(지도학습) 훈련을 위한 노이즈 없는 고품질의 Ground Truth 데이터 확보.
- **원본 보존 및 1회용 추출 원칙:** SQLite DB에는 시스템 흐름 추적을 위한 메타데이터를 영구 보존하지만, AI 학습용 데이터에는 시스템 메타데이터(`session_id`, `proposal_id` 등)를 일절 포함하지 않습니다. 이는 모델이 무의미한 ID 문자열을 정답 패턴으로 착각하여 할루시네이션을 일으키는 것을 막기 위함입니다.

---

## 2. 작업 방식: "JSONL 수동 작성 금지" (작업 폴더 구조)

최종 학습 파일은 한 줄에 JSON 하나씩 들어가는 `.jsonl` 형식이지만, **사람이 직접 JSONL을 작성하면 이스케이프(`\n`, `\"`) 오류로 인해 100% 포맷이 깨집니다.**
따라서 팀원 A는 다음과 같은 폴더/파일 구조로만 데이터를 작성하십시오. (추후 팀원 B가 이를 파싱하여 jsonl로 병합하는 스크립트를 제공/실행합니다.)

```text
synthetic_dataset/
  ├── case_01_syntax_conflict/
  │     ├── prompt.md       # (입력값) 시스템 지시문 + 충돌 마커가 포함된 원본 코드
  │     └── chosen.json     # (정답값) 충돌이 해결된 결과물을 담은 JSON 파일
  ├── case_02_logic_conflict/
  │     ├── prompt.md
  │     └── chosen.json
  ...
```

---

## 3. 파일 작성 상세 가이드

### 3.1. `prompt.md` (입력 컨텍스트)
AI가 보고 풀어야 할 시험지입니다. **반드시 일관된 시스템 프롬프트와 함께 실제 Git 충돌 마커가 포함되어야 합니다.**

```markdown
<!-- prompt.md 예시 -->
당신은 GitCat의 수석 AI 병합 엔지니어입니다. 아래의 충돌이 발생한 코드를 분석하고, 문맥에 맞게 안전하게 병합한 결과를 JSON 형식으로 반환해 주세요.

<<<<<<< HEAD
const apiUrl = "https://api.v1.com";
=======
const apiUrl = "https://api.v2.com/graphql";
>>>>>>> feature/update-api
```

### 3.2. `chosen.json` (정답 스키마)
AI가 최종적으로 뱉어내야 할 정답지입니다. **단순한 소스 코드가 아니라, 파서(Parser)가 읽을 수 있는 완벽한 JSON 형식이어야 합니다.**
우리가 구현할 기능(Feature Type)에 따라 작성해야 하는 JSON Key가 다릅니다. 상황에 맞는 스키마를 선택해 작성하세요.

#### A. 병합 초안 생성 (merge_patch_draft) 케이스
가장 일반적인 "코드 병합" 상황일 때 작성합니다.
```json
{
  "title": "API 엔드포인트 v2 업데이트 병합",
  "summary": "충돌이 발생한 API URL을 v2 GraphQL 엔드포인트로 병합했습니다.",
  "explanation": "feature 브랜치의 v2 업데이트가 최신 규격이므로 이를 채택합니다.",
  "merged_code": "const apiUrl = \"https://api.v2.com/graphql\";",
  "validation_summary": "v2 엔드포인트 변경에 따른 다른 파일의 호출부 확인이 필요합니다."
}
```

#### B. 충돌 원인 분석 (conflict_explanation) 케이스
코드를 직접 병합하기보단, 왜 충돌이 났는지 설명하는 상황일 때 작성합니다.
```json
{
  "title": "API URL 버전 충돌",
  "summary": "HEAD는 v1, feature 브랜치는 v2를 가리키고 있습니다.",
  "cause_summary": "엔드포인트 버저닝 불일치",
  "detailed_explanation": "한 브랜치는 기존 REST API를 유지했고, 다른 브랜치는 GraphQL로 전환했습니다.",
  "related_files": ["src/api/config.ts"],
  "recommended_resolution_direction": "팀의 백엔드 전환 계획에 따라 v2 GraphQL을 채택하는 것을 권장합니다.",
  "risk_level": "medium"
}
```

#### C. 중재안 제공 (merge_mediation) 케이스
서로 아키텍처가 달라 A안, B안 등 선택지를 제공해야 할 때 작성합니다.
```json
{
  "title": "API 버전 병합 중재안",
  "summary": "v1 유지와 v2 전환 중 선택이 필요합니다.",
  "explanation": "두 브랜치가 완전히 다른 통신 방식을 채택했습니다.",
  "recommended_option": "Option 2: v2 GraphQL로 전면 전환",
  "tradeoffs": "v2 전환 시 클라이언트 코드 대거 수정 필요, 단 장기적으로 성능 향상.",
  "recommended_next_action": "백엔드 팀과 API 버전 호환성 논의"
}
```

---

## 4. 엣지 케이스 (Edge Cases) 권장 사항

실제 실무에서 발생하는 다양한 충돌 상황을 의도적으로 섞어서 폴더(`case_xx`)를 생성해 주세요.

1. **수직적 로직 충돌:** 한 브랜치에서는 함수를 호출했는데, 다른 브랜치에서는 그 함수 정의를 삭제한 경우.
2. **의존성 충돌:** `package.json`에서 서로 다른 버전의 라이브러리를 추가한 경우.
3. **포맷팅 충돌:** 로직은 같으나 Prettier 포맷팅(띄어쓰기, 줄바꿈) 차이로 충돌 마커가 생긴 경우. (정답은 팀 컨벤션에 맞는 코드로 작성)
4. **다중 파일 충돌:** 하나의 `prompt.md` 안에 여러 파일의 충돌 마커를 연달아 배치한 경우.
