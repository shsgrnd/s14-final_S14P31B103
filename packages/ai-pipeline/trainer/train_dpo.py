import argparse
import inspect
import json
import os
from typing import List

import torch
from datasets import Dataset, load_dataset
from peft import LoraConfig, PeftModel, TaskType
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
from trl import DPOTrainer

try:
    from trl import DPOConfig
except ImportError:  # pragma: no cover - older TRL releases do not expose DPOConfig
    DPOConfig = None

try:
    import wandb
except ImportError:  # pragma: no cover - wandb is optional at runtime
    wandb = None


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATASET_PATH = os.path.abspath(
    os.path.join(BASE_DIR, "..", "data", "dpo_training_data.jsonl")
)
DEFAULT_OUTPUT_DIR = os.path.abspath(os.path.join(BASE_DIR, "outputs", "dpo-run"))
DEFAULT_ADAPTER_OUTPUT_DIR = os.path.abspath(
    os.path.join(BASE_DIR, "models", "gitcat-dpo-lora-final")
)
DEFAULT_MODEL_ID = "Qwen/Qwen2.5-Coder-7B-Instruct"
DEFAULT_LORA_TARGET_MODULES = "q_proj,k_proj,v_proj,o_proj"


def parse_args() -> argparse.Namespace:
    # SFT 스크립트와 최대한 비슷한 인자 구조를 유지해,
    # 팀원이 학습 타입만 바꿔도 같은 감각으로 실행할 수 있게 합니다.
    parser = argparse.ArgumentParser(
        description="GitCat DPO-LoRA training entrypoint",
    )
    parser.add_argument(
        "--model-id",
        default=DEFAULT_MODEL_ID,
        help="HuggingFace base model id. Defaults to the same base model used for SFT.",
    )
    parser.add_argument(
        "--dataset-path",
        default=DEFAULT_DATASET_PATH,
        help="DPO preference JSONL path. Each row must include prompt/chosen/rejected.",
    )
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help="Trainer checkpoint output directory.",
    )
    parser.add_argument(
        "--adapter-output-dir",
        default=DEFAULT_ADAPTER_OUTPUT_DIR,
        help="Final DPO LoRA adapter save directory.",
    )
    parser.add_argument(
        "--sft-adapter-path",
        default=None,
        help="Optional path to a previously trained SFT adapter. If set, DPO starts from that adapter.",
    )
    parser.add_argument(
        "--dataset-domain",
        choices=["merge", "recommendation"],
        help="Train only a single dataset domain when running focused experiments.",
    )
    parser.add_argument(
        "--feature-type",
        choices=[
            "merge_patch_draft",
            "conflict_explanation",
            "merge_mediation",
            "recommendation",
        ],
        help="Optional feature_type filter for focused DPO runs.",
    )
    parser.add_argument(
        "--recommendation-type",
        choices=["branch_name", "commit_message", "pr_description"],
        help="Optional recommendation subtype filter.",
    )
    parser.add_argument(
        "--max-samples",
        type=int,
        help="Cap dataset size for smoke tests before starting a long GPU run.",
    )
    parser.add_argument("--max-prompt-length", type=int, default=1536)
    parser.add_argument("--max-length", type=int, default=2048)
    parser.add_argument("--learning-rate", type=float, default=5e-5)
    parser.add_argument("--per-device-train-batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=8)
    parser.add_argument("--num-train-epochs", type=float, default=1.0)
    parser.add_argument("--max-steps", type=int, default=-1)
    parser.add_argument("--logging-steps", type=int, default=10)
    parser.add_argument("--save-steps", type=int, default=50)
    parser.add_argument("--save-total-limit", type=int, default=2)
    parser.add_argument("--warmup-ratio", type=float, default=0.03)
    parser.add_argument("--weight-decay", type=float, default=0.0)
    parser.add_argument("--beta", type=float, default=0.1)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument(
        "--lora-target-modules",
        default=DEFAULT_LORA_TARGET_MODULES,
        help="Comma-separated attention module names to adapt with LoRA.",
    )
    parser.add_argument(
        "--torch-dtype",
        choices=["auto", "float16", "bfloat16", "float32"],
        default="auto",
        help="Precision policy for base model loading.",
    )
    parser.add_argument(
        "--report-to",
        choices=["none", "wandb"],
        default="none",
        help="Training report backend. Use wandb only when the runtime is logged in.",
    )
    parser.add_argument(
        "--wandb-project",
        default="gitcat-dpo-lora",
        help="Weights & Biases project name when --report-to wandb is used.",
    )
    parser.add_argument(
        "--wandb-run-name",
        default=None,
        help="Optional explicit W&B run name.",
    )
    parser.add_argument(
        "--gradient-checkpointing",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable gradient checkpointing to reduce VRAM usage during long DPO runs.",
    )
    return parser.parse_args()


def parse_csv_list(raw_value: str) -> List[str]:
    return [item.strip() for item in raw_value.split(",") if item.strip()]


def resolve_torch_dtype(dtype_name: str) -> torch.dtype:
    if dtype_name == "float16":
        return torch.float16
    if dtype_name == "bfloat16":
        return torch.bfloat16
    if dtype_name == "float32":
        return torch.float32

    if torch.cuda.is_available():
        if torch.cuda.is_bf16_supported():
            return torch.bfloat16
        return torch.float16

    return torch.float32


def maybe_init_wandb(args: argparse.Namespace) -> None:
    if args.report_to != "wandb":
        return

    if wandb is None:
        raise RuntimeError(
            "wandb is not installed but --report-to wandb was requested."
        )

    run_name = args.wandb_run_name or build_default_run_name(args)
    wandb.init(project=args.wandb_project, name=run_name)


def build_default_run_name(args: argparse.Namespace) -> str:
    model_suffix = args.model_id.split("/")[-1]
    dataset_suffix = args.dataset_domain or args.feature_type or "all"
    return f"dpo-{model_suffix}-{dataset_suffix}"


def normalize_preference_text(value: object, field_name: str) -> str:
    # DPO 데이터는 prompt/chosen/rejected가 모두 "텍스트 completion" 형태여야 합니다.
    # 다만 현재 GitCat 파이프라인에서는 chosen/rejected가 JSON 문자열이나 dict/list 형태로
    # 들어올 수 있으므로, 학습 직전에 문자열로 정규화해 TRL이 안정적으로 읽도록 맞춥니다.
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("{") or text.startswith("["):
            try:
                parsed = json.loads(text)
                return json.dumps(parsed, ensure_ascii=False)
            except json.JSONDecodeError:
                return text
        return text

    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)

    raise ValueError(f"{field_name} must be a string, dict, or list.")


def load_training_dataset(args: argparse.Namespace) -> Dataset:
    # DPO는 SFT와 달리 단일 정답이 아니라 "선호도 쌍"이 필요합니다.
    # 따라서 최소한 prompt/chosen/rejected 3개 컬럼이 모두 존재해야 학습이 가능합니다.
    dataset = load_dataset("json", data_files=args.dataset_path, split="train")

    if args.dataset_domain:
        dataset = dataset.filter(lambda row: row.get("dataset_domain") == args.dataset_domain)

    if args.feature_type:
        dataset = dataset.filter(lambda row: row.get("feature_type") == args.feature_type)

    if args.recommendation_type:
        dataset = dataset.filter(
            lambda row: row.get("recommendation_type") == args.recommendation_type
        )

    if args.max_samples is not None:
        dataset = dataset.select(range(min(args.max_samples, len(dataset))))

    if len(dataset) == 0:
        raise ValueError("Filtered dataset is empty. Relax the dataset filter options.")

    required_fields = {"prompt", "chosen", "rejected"}
    missing_required_fields = required_fields - set(dataset.column_names)
    if missing_required_fields:
        raise ValueError(
            "DPO dataset is missing required columns: "
            + ", ".join(sorted(missing_required_fields))
        )

    def normalize_row(row: dict) -> dict:
        # prompt는 공통 입력, chosen/rejected는 같은 입력에 대한 비교 대상 응답입니다.
        # 빈 문자열이나 비정상 값이 섞이면 DPO loss가 의미를 잃으므로 여기서 선제적으로 막습니다.
        prompt_text = str(row["prompt"]).strip()
        chosen_text = normalize_preference_text(row["chosen"], "chosen")
        rejected_text = normalize_preference_text(row["rejected"], "rejected")

        if not prompt_text:
            raise ValueError("prompt must not be empty")
        if not chosen_text:
            raise ValueError("chosen must not be empty")
        if not rejected_text:
            raise ValueError("rejected must not be empty")

        return {
            "prompt": prompt_text,
            "chosen": chosen_text,
            "rejected": rejected_text,
        }

    dataset = dataset.map(normalize_row)
    return dataset


def build_tokenizer(model_id: str) -> AutoTokenizer:
    tokenizer = AutoTokenizer.from_pretrained(model_id)

    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    tokenizer.padding_side = "right"
    return tokenizer


def build_base_model(args: argparse.Namespace, torch_dtype: torch.dtype) -> AutoModelForCausalLM:
    # DPO는 "현재 학습할 정책 모델"과 "비교 기준이 되는 참조 모델"을 함께 사용합니다.
    # 여기서 만드는 모델은 base model 상태의 공통 로더 역할을 합니다.
    model = AutoModelForCausalLM.from_pretrained(
        args.model_id,
        device_map="auto",
        torch_dtype=torch_dtype,
    )

    if args.gradient_checkpointing:
        model.gradient_checkpointing_enable()
        model.config.use_cache = False

    return model


def build_model(args: argparse.Namespace, torch_dtype: torch.dtype) -> AutoModelForCausalLM:
    model = build_base_model(args, torch_dtype)

    if args.sft_adapter_path:
        # 현재 GitCat 흐름에서는 SFT로 기본 능력을 먼저 올린 뒤 DPO로 정렬하는 것이 목표입니다.
        # 그래서 SFT 어댑터 경로가 주어지면, base model 위에 SFT adapter를 얹은 상태에서
        # DPO를 이어서 학습할 수 있도록 시작점을 바꿉니다.
        model = PeftModel.from_pretrained(model, args.sft_adapter_path, is_trainable=True)
        if args.gradient_checkpointing:
            model.config.use_cache = False

    return model


def build_lora_config(args: argparse.Namespace) -> LoraConfig:
    return LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules=parse_csv_list(args.lora_target_modules),
        lora_dropout=args.lora_dropout,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
    )


def build_training_args(
    args: argparse.Namespace,
    torch_dtype: torch.dtype,
) -> TrainingArguments:
    report_to: List[str] = [] if args.report_to == "none" else [args.report_to]

    training_kwargs = dict(
        output_dir=args.output_dir,
        per_device_train_batch_size=args.per_device_train_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        learning_rate=args.learning_rate,
        num_train_epochs=args.num_train_epochs,
        max_steps=args.max_steps,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        save_total_limit=args.save_total_limit,
        warmup_ratio=args.warmup_ratio,
        weight_decay=args.weight_decay,
        report_to=report_to,
        bf16=torch.cuda.is_available() and torch_dtype == torch.bfloat16,
        fp16=torch.cuda.is_available() and torch_dtype == torch.float16,
        gradient_checkpointing=args.gradient_checkpointing,
        remove_unused_columns=False,
    )

    # TRL 버전에 따라 DPO 전용 설정 클래스(DPOConfig)가 있을 수도, 없을 수도 있습니다.
    # 팀원마다 GPU 서버 환경이 조금 다를 수 있어, 버전 차이를 흡수하도록 양쪽을 모두 지원합니다.
    if DPOConfig is not None:
        return DPOConfig(
            beta=args.beta,
            max_prompt_length=args.max_prompt_length,
            max_length=args.max_length,
            **training_kwargs,
        )

    return TrainingArguments(**training_kwargs)


def build_trainer(
    model: AutoModelForCausalLM,
    ref_model: AutoModelForCausalLM | None,
    tokenizer: AutoTokenizer,
    dataset: Dataset,
    training_args: TrainingArguments,
    lora_config: LoraConfig,
    args: argparse.Namespace,
) -> DPOTrainer:
    # 이미 SFT adapter를 불러온 경우에는 "추가로 새 LoRA를 또 감싸지 않도록" peft_config를 비웁니다.
    # 반대로 base model만 주는 경우에는 여기서 새 LoRA 설정을 감싸 DPO용 adapter를 학습합니다.
    trainer_kwargs = dict(
        model=model,
        ref_model=ref_model,
        train_dataset=dataset,
        args=training_args,
        peft_config=None if args.sft_adapter_path else lora_config,
    )

    trainer_signature = inspect.signature(DPOTrainer.__init__).parameters

    # TRL 버전에 따라 tokenizer 인자명이 processing_class / tokenizer로 나뉘므로
    # 어느 환경에서도 바로 실행되도록 시그니처를 보고 분기합니다.
    if "processing_class" in trainer_signature:
        trainer_kwargs["processing_class"] = tokenizer
    elif "tokenizer" in trainer_signature:
        trainer_kwargs["tokenizer"] = tokenizer

    if "beta" in trainer_signature and DPOConfig is None:
        trainer_kwargs["beta"] = args.beta

    if "max_prompt_length" in trainer_signature and DPOConfig is None:
        trainer_kwargs["max_prompt_length"] = args.max_prompt_length

    if "max_length" in trainer_signature and DPOConfig is None:
        trainer_kwargs["max_length"] = args.max_length

    return DPOTrainer(**trainer_kwargs)


def print_run_summary(args: argparse.Namespace, dataset: Dataset, torch_dtype: torch.dtype) -> None:
    print("🚀 GitCat DPO-LoRA run configuration")
    print(f" - model_id: {args.model_id}")
    print(f" - dataset_path: {args.dataset_path}")
    print(f" - dataset_size: {len(dataset)}")
    print(f" - dataset_domain: {args.dataset_domain or 'all'}")
    print(f" - feature_type: {args.feature_type or 'all'}")
    print(f" - recommendation_type: {args.recommendation_type or 'all'}")
    print(f" - sft_adapter_path: {args.sft_adapter_path or 'none'}")
    print(f" - output_dir: {args.output_dir}")
    print(f" - adapter_output_dir: {args.adapter_output_dir}")
    print(f" - beta: {args.beta}")
    print(f" - torch_dtype: {torch_dtype}")


def main() -> None:
    args = parse_args()
    os.makedirs(args.output_dir, exist_ok=True)
    os.makedirs(args.adapter_output_dir, exist_ok=True)

    maybe_init_wandb(args)

    dataset = load_training_dataset(args)
    torch_dtype = resolve_torch_dtype(args.torch_dtype)
    print_run_summary(args, dataset, torch_dtype)

    tokenizer = build_tokenizer(args.model_id)
    model = build_model(args, torch_dtype)
    # SFT adapter에서 이어서 시작하는 경우, policy model 내부에 이미 SFT adapter가 올라가 있으므로
    # reference model은 별도의 "순수 base model"로 둡니다.
    # 이렇게 해야 DPO가 "SFT 이후 얼마나 더 선호 방향으로 이동했는지"를 비교할 수 있습니다.
    ref_model = None if args.sft_adapter_path else build_base_model(args, torch_dtype)
    lora_config = build_lora_config(args)
    training_args = build_training_args(args, torch_dtype)

    trainer = build_trainer(
        model=model,
        ref_model=ref_model,
        tokenizer=tokenizer,
        dataset=dataset,
        training_args=training_args,
        lora_config=lora_config,
        args=args,
    )

    # 여기까지 오면
    # 1) 데이터셋 검증
    # 2) tokenizer / model / reference model 준비
    # 3) TRL 버전 호환 처리
    # 가 끝난 상태이므로 실제 DPO 학습을 시작합니다.
    print("🚀 DPO-LoRA 학습을 시작합니다!")
    trainer.train()

    # 최종 저장물은 이후 비교 평가나 추론 스크립트에서 바로 읽을 수 있도록
    # adapter와 tokenizer를 함께 저장합니다.
    trainer.model.save_pretrained(args.adapter_output_dir)
    tokenizer.save_pretrained(args.adapter_output_dir)
    print(f"✅ 학습 완료 및 DPO LoRA 어댑터 저장 완료: {args.adapter_output_dir}")


if __name__ == "__main__":
    main()
