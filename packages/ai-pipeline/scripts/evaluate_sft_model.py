import os
import json
import torch
from tqdm import tqdm
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

# 1. 경로 설정
BASE_MODEL_PATH = "/home/j-k14b103/.cache/huggingface/hub/models--Qwen--Qwen2.5-Coder-7B-Instruct/snapshots/c03e6d358207e414f1eca0bb1891e29f1db0e242/"
ADAPTER_PATH = os.path.expanduser("~/final_pjt/s14-final_S14P31B103/packages/ai-pipeline/trainer/models/gitcat-sft-lora-final")
EVAL_DATA_PATH = "packages/ai-pipeline/data/synthetic_conflict_dataset.jsonl"
OUTPUT_PATH = "packages/ai-pipeline/trainer/eval/results/sft_model_results_final.jsonl"

def main():
    print(f"[1/4] Loading Tokenizer and Base Model...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_PATH, trust_remote_code=True)
    
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL_PATH,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True
    )

    print(f"[2/4] Loading LoRA Adapter...")
    model = PeftModel.from_pretrained(model, ADAPTER_PATH)
    model.eval()

    print(f"[3/4] Running Inference...")
    if not os.path.exists(EVAL_DATA_PATH):
        print(f"[ERROR] Eval dataset not found at {EVAL_DATA_PATH}")
        return

    # 데이터 로드
    with open(EVAL_DATA_PATH, "r", encoding="utf-8") as f:
        eval_cases = [json.loads(line) for line in f]

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as out_f:
        for case in tqdm(eval_cases):
            # 평가 데이터셋 필드 매칭 (prompt 사용)
            instruction = "이 Git 충돌 상황을 분석하고 해결책을 설명해줘."
            input_text = case.get("prompt", "")
            gt_text = case.get("chosen", "")
            
            # SFT 학습 시와 동일한 프롬프트 포맷
            prompt = f"### Instruction:\n{instruction}\n\n### Input:\n{input_text}\n\n### Response:\n"
            
            inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_new_tokens=512,  # 빠른 확인을 위해 512로 조정 (충분히 깁니다)
                    temperature=0.1,
                    do_sample=False,
                    repetition_penalty=1.1
                )
            generated_text = tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
            
            result_item = {
                "instruction": instruction,
                "input": input_text,
                "ground_truth": gt_text,
                "sft_response": generated_text.strip()
            }
            out_f.write(json.dumps(result_item, ensure_ascii=False) + "\n")

    print(f"[4/4] Done! Results saved to: {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
