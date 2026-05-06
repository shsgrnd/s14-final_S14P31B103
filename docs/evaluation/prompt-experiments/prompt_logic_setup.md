# Prompt Experiment Logic Setup (Phase 1)

본 문서는 **코드 충돌 설명(Conflict Explanation)** 기능의 품질 향상을 위한 4단계 프롬프트 실험 로직을 정의합니다.

## 1. 실험 목표
- 다양한 프롬프트 전략 중 가장 정확하고 할루시네이션(환각)이 적은 최적의 조합 도출
- 결과물: 최종 시스템 프롬프트(System Prompt) 문구 확정

---

## 2. 4단계 실험 전략 정의

### [전략 A] Zero-shot (Baseline)
- **프롬프트**: "다음 제공된 코드 충돌 상황(Ours, Theirs, Base)을 분석하여 충돌 원인을 설명하고 해결책을 제시해줘."

### [전략 B] Persona + Context (Role-playing)
- **프롬프트**: "너는 10년 차 시니어 소프트웨어 엔지니어이자 Git 마스터야. 사용자가 겪고 있는 코드 충돌의 기술적 원인을 분석해주는 역할을 수행해. 답변은 전문적이면서도 친절한 한국어로 작성해줘."

### [전략 C] Few-shot (Examples)
- **프롬프트**: "너는 Git 마스터야. 다음 예시를 참고해서 답변해. (예시: Ours: const x=1; Theirs: let x=1; -> 변수 선언 방식이 const와 let으로 충돌했습니다. 현대적 문법인 let으로 통일하는 것을 권장합니다.)"

### [전략 D] Chain-of-Thought (Reasoning)
- **프롬프트**: "너는 시니어 엔지니어이야. 다음 단계를 거쳐 생각하고 답변해. 1. Base 대비 각 브랜치의 변경 의도 파악 2. 두 변경 사항이 충돌하는 기술적 이유 도출 3. 최적의 중재안 생성"

---

## 3. 테스트 골든 데이터셋 (Golden Dataset)
- **TEST-01**: 변수명 선언 키워드 중복 수정 (const vs let)
- **TEST-02**: 동일 함수 내 로직 충돌 (+1 vs +2)

---

## 4. 평가 지표
- 정확도(Accuracy), 할루시네이션(Hallucination), 가독성
