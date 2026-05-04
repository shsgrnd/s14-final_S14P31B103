import os
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
from peft import LoraConfig, get_peft_model
from trl import SFTTrainer
import wandb

# 1. WandB 초기화 (선택사항)
wandb.init(project="gitcat-sft-lora", name="baseline-run-01")

# 2. 모델 및 토크나이저 로드 (예: Llama-3-8B)
model_id = "meta-llama/Meta-Llama-3-8B"
tokenizer = AutoTokenizer.from_pretrained(model_id)
tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    model_id, 
    device_map="auto",
    torch_dtype=torch.float16
)

# 3. LoRA 어댑터 설정
lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)
model = get_peft_model(model, lora_config)

# 4. JSONL 데이터셋 로드 (scp로 업로드한 파일)
# 팀원 A가 만든 jsonl 형식: {"prompt": "...", "chosen": "..."}
dataset = load_dataset("json", data_files="data/synthetic_conflict_dataset.jsonl", split="train")

def format_instruction(sample):
    # 모델에 넣을 최종 텍스트 포맷 (Prompt + 정답 JSON)
    return f"### Instruction:\n{sample['prompt']}\n\n### Response:\n{sample['chosen']}"

# 5. SFT Trainer 설정 및 실행
training_args = TrainingArguments(
    output_dir="./outputs",
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    logging_steps=10,
    max_steps=500,
    report_to="wandb"
)

trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    peft_config=lora_config,
    formatting_func=format_instruction,
    max_seq_length=2048,
    tokenizer=tokenizer,
    args=training_args,
)

print("🚀 SFT-LoRA 학습을 시작합니다!")
trainer.train()

# 6. LoRA 가중치 저장
trainer.model.save_pretrained("models/gitcat-sft-lora-final")
print("✅ 학습 완료 및 가중치 저장 완료!")
