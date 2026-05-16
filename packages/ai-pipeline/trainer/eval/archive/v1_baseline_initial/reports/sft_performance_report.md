# 📊 SFT Model Performance Comparison Report

본 리포트는 베이스라인 모델과 SFT(LoRA) 미세조정 모델의 성능을 비교한 최종 결과입니다.

## 1. 정량적 지표 요약 (Average Metrics)

| Metric | Baseline (Before) | SFT Model (After) | Improvement |
| :--- | :---: | :---: | :---: |
| **Text Similarity** | 20.45% | 78.12% | **+57.67%** |
| **JSON Format Success** | 12/67 | 62/67 | **+50** |
| **Avg. Response Length** | 312.4자 | 510.8자 | +198.4자 |

## 2. 주요 개선 사항 분석
- **압도적인 성능 향상**: 텍스트 유사도가 약 3.8배 상승하여 정답에 매우 근접한 답변을 생성함.
- **포맷팅 안정화**: JSON 파싱 성공률이 18%에서 92%로 수직 상승하여 API 연동 적합성 확보.
- **풍부한 설명**: 평균 답변 길이가 길어지며 단순 해결책 제시를 넘어 시니어 개발자 수준의 상세한 원인 분석을 제공함.

## 3. 샘플 케이스 분석 (Similarity Rank)
| Case ID | Baseline Sim. | SFT Sim. | Diff |
| :---: | :---: | :---: | :---: |
| Case 1 | 18.5% | 82.4% | +63.9% |
| Case 2 | 22.1% | 79.5% | +57.4% |
| Case 3 | 15.8% | 85.1% | +69.3% |
| Case 4 | 25.4% | 75.8% | +50.4% |
| Case 5 | 20.4% | 67.9% | +47.5% |

---
**Note**: 본 데이터는 `Qwen2.5-Coder-7B` 베이스 모델에 `gitcat-sft-lora-final` 어댑터를 적용하여 측정한 결과입니다.
