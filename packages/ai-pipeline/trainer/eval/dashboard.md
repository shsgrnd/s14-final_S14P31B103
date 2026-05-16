# 📈 GitCat AI Model Evolution Dashboard

이 문서는 모델 고도화 과정에 따른 주요 성능 지표 변화를 기록합니다. 상세 내용은 `history/` 폴더의 개별 리포트를 참조하세요.

| Date | Ver | Key Changes | DPO Pass@1 | SFT Pass@1 | Link |
| :--- | :--- | :--- | :---: | :---: | :--- |
| 2026-05-13 | v1 | Phase 3 초기 모델 (Base/SFT/DPO) | 61.5% | 75.4% | [View](./history/20260513_v1_initial_base.md) |
| 2026-05-14 | v2 | Phase 4 데이터 정제 & DPO Beta 0.4 적용 | 70.8% | - | [View](./history/20260514_v2_dpo_beta0.4_sanitized.md) |
| 2026-05-16 | v3 | Phase 5 Rejection Sampling & 안정성 고도화 | **TBD** | - | [View](./history/20260516_v3_dpo_rejection_sampling.md) |

---

### 📊 성능 추이 요약
- **JSON 안정성 혁신 (v3)**: Rejection Sampling을 통해 DPO 모델의 고질적인 문제였던 JSON 파싱 오류를 획기적으로 해결 (준수율 0% -> **93.3%**).
- **서비스 실효성 확보**: Hallucination Score를 1.20으로 낮추고 무한 루프를 통제함으로써 실제 서비스에 배포 가능한 수준의 모델 안정성 달성.
- **데이터 정제 효과**: 데이터셋 정제 및 Beta 0.4 설정을 통해 논리 점수를 유지하면서도 가독성과 구조적 완성도를 동시에 확보함.

> *Last updated: 2026-05-16*
