# 📈 GitCat AI Model Evolution Dashboard

이 문서는 모델 고도화 과정에 따른 주요 성능 지표 변화를 기록합니다. 상세 내용은 `history/` 폴더의 개별 리포트를 참조하세요.

| Date | Ver | Key Changes | DPO Pass@1 | SFT Pass@1 | Link |
| :--- | :--- | :--- | :---: | :---: | :--- |
| 2026-05-13 | v1 | Phase 3 초기 모델 (Base/SFT/DPO) | 61.5% | 75.4% | [View](./history/20260513_v1_initial_base.md) |
| 2026-05-14 | v2 | Phase 4 데이터 정제 & DPO Beta 0.4 적용 | **70.8%** | - | [View](./history/20260514_v2_dpo_beta0.4_sanitized.md) |

---

### 📊 성능 추이 요약
- **데이터 정제 효과**: 데이터셋에서 환각 유발 헤더(`### Created...`)를 전면 제거함으로써 응답 안정성이 획기적으로 개선됨.
- **DPO 최적화**: Beta 값을 0.1에서 0.4로 상향 조정하여 고질적인 무한 반복 루프 현상을 해결하고 논리 점수(Pass@1)를 약 **9.3%p** 향상시킴.

> *Last updated: 2026-05-15*
