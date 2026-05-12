#!/bin/bash

# =========================================================================
# AI Model Evaluation Pipeline (자동화 스크립트)
# 작성자: 팀원 C (자동화 오너)
# 사용법: ./run_eval_pipeline.sh [base|sft|dpo]
# =========================================================================

# 인자 확인
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
echo "선택된 모델: $MODEL_TYPE"
echo "=========================================================="

echo ""
echo "▶ 1단계: 모델 추론 시작 (시험 응시)"
# 추론 단계에서 생성된 JSONL은 이후 judge와 비교 리포트의 공통 입력이 됩니다.
echo "----------------------------------------------------------"
python "$SCRIPT_DIR/run_eval_inference.py" --model-type "$MODEL_TYPE"

if [ $? -ne 0 ]; then
  echo "❌ [ERROR] 1단계 추론에 실패했습니다. 파이프라인을 중단합니다."
  exit 1
fi

echo ""
echo "▶ 2단계: LLM-as-a-Judge 채점"
echo "----------------------------------------------------------"
python "$SCRIPT_DIR/evaluate_llm_judge.py" --model-type "$MODEL_TYPE"

if [ $? -ne 0 ]; then
  echo "❌ [ERROR] 2단계 채점에 실패했습니다. 파이프라인을 중단합니다."
  exit 1
fi

echo ""
echo "=========================================================="
echo "✅ [SUCCESS] 모든 평가 자동화 파이프라인이 완료되었습니다!"
echo "결과 리포트는 아래 폴더를 확인하세요:"
echo "📁 $PIPELINE_ROOT/trainer/eval/results/"
echo "=========================================================="
