import argparse
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

def main():
    parser = argparse.ArgumentParser(description="Merge LoRA weights into a base model")
    parser.add_argument("--base_model", type=str, required=True, help="Base model name or path (e.g., Qwen/Qwen2.5-Coder-7B-Instruct)")
    parser.add_argument("--lora_dir", type=str, required=True, help="Path to the directory containing LoRA weights")
    parser.add_argument("--output_dir", type=str, required=True, help="Path to save the merged model")
    args = parser.parse_args()

    print(f"[*] Loading base model: {args.base_model}")
    base_model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        torch_dtype=torch.bfloat16,
        device_map="cpu" # 병합 작업은 보통 CPU 메모리(RAM)를 많이 사용하므로 안전하게 CPU로 지정
    )

    print(f"[*] Loading tokenizer from LoRA dir (or base model)...")
    try:
        tokenizer = AutoTokenizer.from_pretrained(args.lora_dir)
    except:
        print("    No tokenizer found in LoRA dir. Loading from base model instead.")
        tokenizer = AutoTokenizer.from_pretrained(args.base_model)

    print(f"[*] Loading LoRA adapter from: {args.lora_dir}")
    model = PeftModel.from_pretrained(base_model, args.lora_dir)

    print("[*] Merging weights... This may take a few minutes.")
    merged_model = model.merge_and_unload()

    print(f"[*] Saving merged model to: {args.output_dir}")
    merged_model.save_pretrained(args.output_dir, safe_serialization=True)
    tokenizer.save_pretrained(args.output_dir)
    
    print("[+] Merge completed successfully!")

if __name__ == "__main__":
    main()
