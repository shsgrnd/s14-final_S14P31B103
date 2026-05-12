import os
import json
import torch
import argparse
from tqdm import tqdm
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_MODEL_ID = "Qwen/Qwen2.5-Coder-7B-Instruct"

def parse_args():
    parser = argparse.ArgumentParser(description="Run batch inference for model evaluation.")
    parser.add_argument("--model-type", type=str, choices=["base", "sft", "dpo"], required=True,
                        help="평가할 모델의 종류를 선택하세요 (base, sft, dpo)")
    parser.add_argument("--adapter-path", type=str, default=None,
                        help="sft나 dpo 선택 시 LoRA 어댑터 경로. (기본값: trainer/models/gitcat-{model_type}-lora-final)")
    parser.add_argument("--eval-data", type=str, default=os.path.join(BASE_DIR, "../data/synthetic_conflict_dataset.jsonl"),
                        help="평가용 질문이 들어있는 데이터셋 경로")
    return parser.parse_args()

def main():
    args = parse_args()
    
    # 1. 경로 설정
    if args.adapter_path is None:
        if args.model_type == "sft":
            adapter_path = os.path.join(BASE_DIR, "../trainer/models/gitcat-sft-lora-final")
        elif args.model_type == "dpo":
            adapter_path = os.path.join(BASE_DIR, "../trainer/models/gitcat-dpo-lora-final")
        else:
            adapter_path = None
    else:
        adapter_path = args.adapter_path
        
    output_path = os.path.join(BASE_DIR, f"../trainer/eval/results/{args.model_type}_model_results.jsonl")

    # 2. 데이터 로드
    if not os.path.exists(args.eval_data):
        print(f"[ERROR] Eval dataset not found at {args.eval_data}")
        return

    with open(args.eval_data, "r", encoding="utf-8") as f:
        eval_cases = [json.loads(line) for line in f]
        
    print(f"\n[INFO] Starting Evaluation Inference for: {args.model_type.upper()} Model")
    print(f"- Total questions: {len(eval_cases)}")

    # 3. 모델 로드
    print(f"\n[1/3] Loading Tokenizer and Base Model ({BASE_MODEL_ID})...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL_ID,
        device_map="auto",
        torch_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
    )

    if args.model_type in ["sft", "dpo"]:
        print(f"[2/3] Loading LoRA Adapter from {adapter_path}...")
        if not os.path.exists(adapter_path):
            print(f"[ERROR] Adapter not found at {adapter_path}")
            return
        model = PeftModel.from_pretrained(model, adapter_path)
    else:
        print("[2/3] Using Base Model only (No adapter).")
        
    model.eval()

    # 4. 추론 실행
    print(f"\n[3/3] Running Inference...")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as out_f:
        for case in tqdm(eval_cases):
            instruction = case.get("instruction", "이 Git 충돌 상황을 분석하고 해결책을 설명해줘.")
            
            # input 필드가 dict 객체인 경우 JSON 문자열로 변환 (generate_dpo_candidates와 동일 로직)
            raw_input = case.get("input", "")
            if isinstance(raw_input, dict):
                raw_input = json.dumps(raw_input, ensure_ascii=False)
                
            gt_text = case.get("output", "") # 참고용 정답
            prompt = f"### Instruction:\n{instruction}\n\n{raw_input}\n\n### Response:\n"
            
            inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_new_tokens=1024,
                    temperature=0.1, # 평가를 위해 일관된 답변을 생성하도록 낮은 온도 설정
                    do_sample=False,
                    pad_token_id=tokenizer.eos_token_id
                )
            
            input_length = inputs.input_ids.shape[1]
            generated_text = tokenizer.decode(outputs[0][input_length:], skip_special_tokens=True).strip()
            
            result_item = {
                "instruction": instruction,
                "input": raw_input,
                "ground_truth": gt_text,
                f"{args.model_type}_response": generated_text
            }
            out_f.write(json.dumps(result_item, ensure_ascii=False) + "\n")

    print(f"\n[SUCCESS] Done! Inference results saved to: {output_path}")

if __name__ == "__main__":
    main()
