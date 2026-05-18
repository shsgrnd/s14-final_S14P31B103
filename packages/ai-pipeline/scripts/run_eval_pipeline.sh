#!/bin/bash

# =========================================================================
# AI Model Evaluation Pipeline (원클릭 자동화 스크립트)
# 작성자: 팀원 C (자동화 오너)
# 사용법: ./run_eval_pipeline.sh [base|sft|dpo]
#
# 실행 단계:
#   1. run_eval_inference.py     - 모델 추론 (시험 응시)
#   2. evaluate_llm_judge.py     - GPT-4.1-mini 자동 채점
#   3. analyze_eval_results.py   - Pass@1, Similarity 계산 + 실패 케이스 추출
#   4. generate_eval_report.py   - 종합 비교 리포트 생성 (MD)
# =========================================================================

if [ -z "$1" ]; then
  echo "❌ 에러: 평가할 모델의 종류를 인자로 입력해야 합니다."
  echo "👉 사용법: ./run_eval_pipeline.sh [base|sft|dpo]"
  exit 1
fi

MODEL_TYPE=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PIPELINE_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=========================================================="
echo "🚀 [START] 모델 평가 자동화 파이프라인 가동"
echo "   선택된 모델: $MODEL_TYPE"
echo "=========================================================="

echo ""
echo "▶ 1단계: 모델 추론 시작 (시험 응시)"
# 추론 단계에서 생성된 JSONL은 이후 judge와 비교 리포트의 공통 입력이 됩니다.
echo "----------------------------------------------------------"
python "$SCRIPT_DIR/run_eval_inference.py" --model-type "$MODEL_TYPE"
if [ $? -ne 0 ]; then
  echo "❌ [ERROR] 1단계 추론 실패. 파이프라인을 중단합니다."
  exit 1
fi

echo ""
echo "▶ 2단계: GPT-4.1-mini 자동 채점 (LLM-as-a-Judge)"
echo "----------------------------------------------------------"
python "$SCRIPT_DIR/evaluate_llm_judge.py" --model-type "$MODEL_TYPE"
if [ $? -ne 0 ]; then
  echo "❌ [ERROR] 2단계 채점 실패. 파이프라인을 중단합니다."
  exit 1
fi

echo ""
echo "▶ 3단계: Pass@1 & Similarity 지표 계산 + 실패 케이스 추출"
echo "----------------------------------------------------------"
python "$SCRIPT_DIR/analyze_eval_results.py" --model-type "$MODEL_TYPE"

echo ""
echo "▶ 4단계: 종합 평가 리포트(Markdown) 생성"
echo "----------------------------------------------------------"
python "$SCRIPT_DIR/generate_eval_report.py"

echo ""
echo "=========================================================="
echo "✅ [SUCCESS] 모든 평가 파이프라인이 완료되었습니다!"
echo "   최종 리포트 위치: $PIPELINE_ROOT/trainer/eval/reports/"
echo "=========================================================="
