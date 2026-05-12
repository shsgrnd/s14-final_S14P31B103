import argparse
import json
import os
import re
from typing import Any, Dict, Optional, Tuple

import torch
from peft import PeftModel
from tqdm import tqdm
from transformers import AutoModelForCausalLM, AutoTokenizer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_MODEL_ID = "Qwen/Qwen2.5-Coder-7B-Instruct"


def parse_args():
    parser = argparse.ArgumentParser(description="Run batch inference for model evaluation.")
    parser.add_argument(
        "--model-type",
        type=str,
        choices=["base", "sft", "dpo"],
        required=True,
        help="평가할 모델의 종류를 선택하세요 (base, sft, dpo)",
    )
    parser.add_argument(
        "--adapter-path",
        type=str,
        default=None,
        help="sft나 dpo 선택 시 LoRA 어댑터 경로. (기본값: trainer/models/gitcat-{model_type}-lora-final)",
    )
    parser.add_argument(
        "--eval-data",
        type=str,
        default=os.path.join(BASE_DIR, "../data/synthetic_conflict_dataset.jsonl"),
        help="평가용 JSONL 경로. 현재 표준 포맷은 prompt/chosen 기반입니다.",
    )
    parser.add_argument(
        "--output-path",
        type=str,
        default=None,
        help="추론 결과 저장 경로. 비우면 trainer/eval/results/{model_type}_model_results.jsonl 를 사용합니다.",
    )
    parser.add_argument(
        "--max-new-tokens",
        type=int,
        default=1024,
        help="케이스당 최대 생성 토큰 수",
    )
    return parser.parse_args()


def resolve_adapter_path(model_type: str, adapter_path: Optional[str]) -> Optional[str]:
    if adapter_path is not None:
        return adapter_path
    if model_type == "sft":
        return os.path.join(BASE_DIR, "../trainer/models/gitcat-sft-lora-final")
    if model_type == "dpo":
        return os.path.join(BASE_DIR, "../trainer/models/gitcat-dpo-lora-final")
    return None


def resolve_output_path(model_type: str, output_path: Optional[str]) -> str:
    if output_path is not None:
        return output_path
    return os.path.join(BASE_DIR, f"../trainer/eval/results/{model_type}_model_results.jsonl")


def resolve_torch_dtype() -> torch.dtype:
    if not torch.cuda.is_available():
        return torch.float32
    if torch.cuda.is_bf16_supported():
        return torch.bfloat16
    return torch.float16


def read_jsonl_records(file_path: str) -> list[Dict[str, Any]]:
    records: list[Dict[str, Any]] = []
    with open(file_path, "r", encoding="utf-8") as file:
        for line in file:
            stripped = line.strip()
            if stripped:
                records.append(json.loads(stripped))
    return records


def normalize_model_response(response_text: str) -> str:
    # 모델이 ```json ... ``` 형태로 감싸 답해도 baseline 비교 축과 같은 방식으로
    # 안쪽 JSON 본문만 꺼내도록 정규화합니다.
    trimmed = response_text.strip()
    fenced_match = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", trimmed, re.IGNORECASE)
    if fenced_match:
        return fenced_match.group(1).strip()
    return trimmed


def safe_parse_json(raw_text: str) -> Tuple[bool, Optional[Any]]:
    try:
        return True, json.loads(raw_text)
    except json.JSONDecodeError:
        return False, None


def stable_stringify(value: Any) -> str:
    # key 순서 차이 때문에 같은 JSON이 다르게 보이는 문제를 막기 위해
    # 비교 전에는 항상 정렬된 문자열로 바꿉니다.
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def resolve_model_device(model: AutoModelForCausalLM) -> torch.device:
    return next(model.parameters()).device


def build_result_record(
    case: Dict[str, Any],
    model_type: str,
    adapter_path: Optional[str],
    raw_response: str,
    normalized_response: str,
) -> Dict[str, Any]:
    chosen_text = case.get("chosen", "")
    chosen_ok, chosen_json = safe_parse_json(chosen_text)
    response_ok, response_json = safe_parse_json(normalized_response)
    exact_json_match = (
        chosen_ok
        and response_ok
        and stable_stringify(chosen_json) == stable_stringify(response_json)
    )

    result: Dict[str, Any] = {
        "case_id": case.get("case_id", ""),
        "case_path": case.get("case_path"),
        "dataset_domain": case.get("dataset_domain"),
        "feature_type": case.get("feature_type", "unknown"),
        "recommendation_type": case.get("recommendation_type"),
        "prompt": case.get("prompt", ""),
        "chosen": chosen_text,
        "model_type": model_type,
        "adapter_path": adapter_path,
        "raw_response": raw_response,
        "normalized_response": normalized_response,
        "json_parse_ok": response_ok,
        "exact_json_match": exact_json_match,
    }

    if response_ok:
        result["response_json"] = response_json
    else:
        result["error"] = "response_json_parse_failed"

    return result


def main():
    args = parse_args()
    adapter_path = resolve_adapter_path(args.model_type, args.adapter_path)
    output_path = resolve_output_path(args.model_type, args.output_path)

    if not os.path.exists(args.eval_data):
        raise FileNotFoundError(f"Eval dataset not found at {args.eval_data}")

    eval_cases = read_jsonl_records(args.eval_data)
    print(f"\n[INFO] Starting Evaluation Inference for: {args.model_type.upper()} Model")
    print(f"- Total questions: {len(eval_cases)}")

    print(f"\n[1/3] Loading Tokenizer and Base Model ({BASE_MODEL_ID})...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL_ID,
        device_map="auto",
        torch_dtype=resolve_torch_dtype(),
    )

    if args.model_type in {"sft", "dpo"}:
        print(f"[2/3] Loading LoRA Adapter from {adapter_path}...")
        if adapter_path is None or not os.path.exists(adapter_path):
            raise FileNotFoundError(f"Adapter not found at {adapter_path}")
        model = PeftModel.from_pretrained(model, adapter_path)
    else:
        print("[2/3] Using Base Model only (No adapter).")

    model.eval()
    model_device = resolve_model_device(model)

    print(f"\n[3/3] Running Inference...")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as output_file:
        for case in tqdm(eval_cases):
            prompt = case.get("prompt", "").strip()
            if not prompt:
                continue

            # 현재 synthetic dataset의 prompt는 이미 "모델에게 바로 넣을 완성형 입력"이므로
            # 예전 instruction/input 조합을 다시 만들지 않고 원문 그대로 사용합니다.
            inputs = tokenizer(prompt, return_tensors="pt").to(model_device)
            with torch.inference_mode():
                outputs = model.generate(
                    **inputs,
                    max_new_tokens=args.max_new_tokens,
                    do_sample=False,
                    pad_token_id=tokenizer.pad_token_id,
                    eos_token_id=tokenizer.eos_token_id,
                )

            prompt_token_length = inputs.input_ids.shape[1]
            raw_response = tokenizer.decode(
                outputs[0][prompt_token_length:],
                skip_special_tokens=True,
            ).strip()
            normalized_response = normalize_model_response(raw_response)
            result_record = build_result_record(
                case=case,
                model_type=args.model_type,
                adapter_path=adapter_path,
                raw_response=raw_response,
                normalized_response=normalized_response,
            )
            output_file.write(json.dumps(result_record, ensure_ascii=False) + "\n")

    print(f"\n[SUCCESS] Done! Inference results saved to: {output_path}")


if __name__ == "__main__":
    main()
