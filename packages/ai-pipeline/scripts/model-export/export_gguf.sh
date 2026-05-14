#!/bin/bash

# 사용법: ./export_gguf.sh <LORA_DIR> [BASE_MODEL_ID]
# 예시: ./export_gguf.sh ../models/gitcat-sft-lora-final Qwen/Qwen2.5-Coder-7B-Instruct

set -e

LORA_DIR=$1
BASE_MODEL=${2:-"Qwen/Qwen2.5-Coder-7B-Instruct"}

if [ -z "$LORA_DIR" ]; then
    echo "Usage: $0 <path_to_lora_dir> [base_model_id]"
    echo "Example: $0 ./gitcat-sft-lora-final Qwen/Qwen2.5-Coder-7B-Instruct"
    exit 1
fi

WORK_DIR=$(pwd)
MERGED_DIR="$WORK_DIR/merged_hf_model"
OUT_GGUF="$WORK_DIR/gitcat-merged-f16.gguf"
FINAL_GGUF="$WORK_DIR/gitcat-merged-Q4_K_M.gguf"

echo "================================================="
echo " GitCat AI Model Export Pipeline"
echo "================================================="
echo "Base Model: $BASE_MODEL"
echo "LoRA Dir: $LORA_DIR"
echo "================================================="

# 1. 의존성 패키지 설치 확인
echo "[1/4] Checking python dependencies..."
pip install -q transformers peft torch || echo "Failed to install python dependencies. Please install manually."

# 2. 파이썬 스크립트로 모델 병합
echo "[2/4] Merging LoRA into Base model..."
python3 merge_lora.py --base_model "$BASE_MODEL" --lora_dir "$LORA_DIR" --output_dir "$MERGED_DIR"

# 3. llama.cpp 클론 및 요구사항 설치
echo "[3/4] Preparing llama.cpp for GGUF conversion..."
if [ ! -d "llama.cpp" ]; then
    git clone https://github.com/ggerganov/llama.cpp.git
fi
cd llama.cpp
pip install -r requirements.txt -q

echo "[4/4] Converting to GGUF format..."
# F16으로 1차 변환
python3 convert_hf_to_gguf.py "$MERGED_DIR" --outfile "$OUT_GGUF" --outtype f16

echo "================================================="
echo "🎉 Conversion Completed!"
echo "Merged HF Model: $MERGED_DIR"
echo "GGUF File (F16): $OUT_GGUF"
echo "================================================="
echo ""
echo "[Optional] 4-bit 양자화(Q4_K_M)를 원하신다면 llama.cpp 폴더 내에서 make 빌드 후 아래 명령어를 실행하세요:"
echo "./llama-quantize $OUT_GGUF $FINAL_GGUF Q4_K_M"
echo "================================================="
