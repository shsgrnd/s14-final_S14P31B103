import os
import json
import sys
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_MODEL_ID = "Qwen/Qwen2.5-Coder-7B-Instruct"
ADAPTER_DIR = os.path.abspath(os.path.join(BASE_DIR, "../trainer/models/gitcat-sft-lora-final"))

def load_sft_model():
    print(f"[INFO] Loading base model: {BASE_MODEL_ID}...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID)
    
    # GPU 환경에 맞춰 자동 할당
    base_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL_ID,
        device_map="auto",
        torch_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
    )
    
    print(f"[INFO] Loading LoRA adapter: {ADAPTER_DIR}...")
    if not os.path.exists(ADAPTER_DIR):
        print(f"[ERROR] Adapter not found at {ADAPTER_DIR}")
        print("Please ensure SFT training is completed first.")
        sys.exit(1)
        
    model = PeftModel.from_pretrained(base_model, ADAPTER_DIR)
    model.eval()
    return tokenizer, model

def generate_candidate(tokenizer, model, prompt_text, temp):
    """주어진 온도로 단일 답변 생성"""
    # SFT 학습 시 사용했던 동일한 프롬프트 포맷 적용
    formatted_prompt = f"### Instruction:\n{prompt_text}\n\n### Response:\n"
    
    inputs = tokenizer(formatted_prompt, return_tensors="pt").to(model.device)
    
    try:
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=1024,
                temperature=temp,
                do_sample=True, # 다양성 확보를 위해 sampling 활성화
                top_p=0.9,
                pad_token_id=tokenizer.eos_token_id
            )
        
        # 입력 프롬프트 부분을 제외하고 새로 생성된 텍스트만 추출
        input_length = inputs.input_ids.shape[1]
        generated_tokens = outputs[0][input_length:]
        return tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()
    except Exception as e:
        print(f"\n[ERROR] Generation failed for temp {temp}: {e}", flush=True)
        return None

def main():
    input_file = os.path.join(BASE_DIR, "../data/sft_training_data.jsonl")
    output_file = os.path.join(BASE_DIR, "../data/dpo_candidates_raw.jsonl")
    
    if not os.path.exists(input_file):
        print(f"[ERROR] Input file not found: {input_file}")
        sys.exit(1)
        
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # 오픈소스 모델 로드
    tokenizer, model = load_sft_model()
    
    # 다양성 확보를 위한 3가지 Temperature (0.4=안전함, 0.7=일반, 1.0=창의적/위험함)
    temperatures = [0.4, 0.7, 1.0]
    
    print(f"\n[START] DPO Candidate Generation via Local SFT Model", flush=True)
    
    count = 0
    with open(input_file, 'r', encoding='utf-8') as fin, open(output_file, 'w', encoding='utf-8') as fout:
        for line in fin:
            if not line.strip():
                continue
                
            data = json.loads(line)
            # input 필드가 dict 객체인 경우 JSON 문자열로 변환하여 SFT 학습 포맷과 일치시킴
            raw_input = data['input']
            if isinstance(raw_input, dict):
                raw_input = json.dumps(raw_input, ensure_ascii=False)
            prompt_text = f"{data['instruction']}\n\n{raw_input}"
            
            candidates = []
            sys.stdout.write(f"\nProcessing prompt (length {len(prompt_text)})... ")
            sys.stdout.flush()
            
            for temp in temperatures:
                answer = generate_candidate(tokenizer, model, prompt_text, temp)
                if answer:
                    candidates.append({"text": answer, "temperature": temp})
                    sys.stdout.write(".")
                    sys.stdout.flush()
            
            # 최종 DPO 후보 포맷으로 저장
            dpo_row = {
                "prompt": prompt_text,
                "original_output": data.get("output", ""), # 참고용 정답
                "candidates": candidates
            }
            fout.write(json.dumps(dpo_row, ensure_ascii=False) + "\n")
            count += 1

    print(f"\n\n[SUCCESS] Total {count} DPO candidate sets generated at: {output_file}", flush=True)

if __name__ == "__main__":
    main()
