import argparse
import json
import os
import re
import sys
from typing import Any, Dict

from dotenv import load_dotenv
from openai import OpenAI

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, "../../../.env"))

API_KEY = os.getenv("GMS_KEY")
GMS_BASE_URL = os.getenv("GMS_BASE_URL", "https://gms.ssafy.io/gmsapi/")


def resolve_gms_url(base_url: str) -> str:
    normalized = base_url if base_url.endswith("/") else base_url + "/"
    if "api.openai.com" not in normalized:
        return f"{normalized}api.openai.com/v1"
    return normalized


def build_client() -> OpenAI:
    if not API_KEY:
        raise RuntimeError("GMS_KEY is required to run LLM judge evaluation")
    return OpenAI(api_key=API_KEY, base_url=resolve_gms_url(GMS_BASE_URL))


def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate model responses using LLM-as-a-Judge.")
    parser.add_argument(
        "--model-type",
        type=str,
        choices=["base", "sft", "dpo"],
        required=True,
        help="평가할 모델의 종류 (base, sft, dpo)",
    )
    parser.add_argument(
        "--input-file",
        type=str,
        default=None,
        help="run_eval_inference.py 결과 파일 경로",
    )
    parser.add_argument(
        "--output-file",
        type=str,
        default=None,
        help="judge 점수 결과 파일 경로",
    )
    parser.add_argument(
        "--judge-model",
        type=str,
        default="gpt-4.1-mini",
        help="LLM judge에 사용할 모델 이름",
    )
    return parser.parse_args()


def resolve_input_file(model_type: str, input_file: str | None) -> str:
    if input_file is not None:
        return input_file
    return os.path.join(BASE_DIR, f"../trainer/eval/results/{model_type}_model_results.jsonl")


def resolve_output_file(model_type: str, output_file: str | None) -> str:
    if output_file is not None:
        return output_file
    return os.path.join(BASE_DIR, f"../trainer/eval/results/{model_type}_llm_judge_scores.jsonl")


def extract_json_block(raw_text: str) -> Dict[str, Any]:
    json_match = re.search(r"\{[\s\S]*\}", raw_text, re.DOTALL)
    if not json_match:
        return {"accuracy": 0, "clarity": 0, "format": 0, "json_valid": False}
    try:
        data = json.loads(json_match.group(0))
        data["json_valid"] = True
        return data
    except json.JSONDecodeError:
        return {"accuracy": 0, "clarity": 0, "format": 0, "json_valid": False}


def calculate_repetition_rate(text: str, window_size: int = 10) -> float:
    """텍스트 내 시퀀스 반복 비율을 계산하여 무한 루프 징후를 포착합니다."""
    if not text or len(text) < window_size * 2:
        return 0.0

    words = text.split()
    if len(words) < window_size * 2:
        return 0.0

    sequences = []
    for i in range(len(words) - window_size + 1):
        sequences.append(" ".join(words[i : i + window_size]))

    unique_sequences = set(sequences)
    if not sequences:
        return 0.0
    return 1.0 - (len(unique_sequences) / len(sequences))


def build_task_context(record: Dict[str, Any]) -> str:
    dataset_domain = record.get("dataset_domain") or "unknown"
    feature_type = record.get("feature_type") or "unknown"
    recommendation_type = record.get("recommendation_type") or "n/a"
    case_id = record.get("case_id") or "unknown"
    return (
        f"- Case ID: {case_id}\n"
        f"- Dataset Domain: {dataset_domain}\n"
        f"- Feature Type: {feature_type}\n"
        f"- Recommendation Type: {recommendation_type}"
    )


def build_judge_prompt(record: Dict[str, Any], response_text: str) -> str:
    # merge와 recommendation을 같은 파이프라인으로 평가해야 하므로,
    # judge에게는 케이스 메타데이터와 reference answer를 함께 줘서
    # "정답 문구 일치"가 아니라 "의도와 구조의 적합성"을 보게 합니다.
    return f"""당신은 GitCat AI 품질을 검수하는 시니어 평가자입니다.
아래 prompt, reference answer, model response를 보고 응답 품질을 평가하세요.

[케이스 메타데이터]
{build_task_context(record)}

[평가 원칙]
1. reference answer는 의미적 기준선으로만 사용하고, 표현이 다르더라도 같은 의도와 품질이면 감점하지 마세요.
2. prompt에서 요구한 작업을 실제로 수행했는지 가장 먼저 보세요.
3. format 점수는 JSON/마크다운/필드 구조 등 "요구된 출력 계약"을 얼마나 잘 지켰는지 기준으로 평가하세요.

[점수 기준]
- accuracy: 작업 의도 충족도, 기술적 타당성, reference 대비 의미 보존 정도 (1~10)
- clarity: 설명의 명확성, 읽기 쉬움, 후속 행동 가능성 (1~10)
- format: JSON/필드 구조/마크다운 등 출력 형식 준수 정도 (1~10)
- hallucination: 코드에 없는 변수, 함수, 파일명을 허구로 지어냈는지 여부 (1: 없음, 10: 심각함)

[Prompt]
{record.get("prompt", "")}

[Reference Answer]
{record.get("chosen", "")}

[Model Response]
{response_text}

결과는 반드시 아래 JSON 형식으로만 답하세요.
{{"accuracy": 8, "clarity": 9, "format": 10, "hallucination": 1}}
"""


def score_with_llm(
    client: OpenAI,
    judge_model: str,
    record: Dict[str, Any],
    response_text: str,
) -> Dict[str, Any]:
    judge_prompt = build_judge_prompt(record, response_text)
    try:
        response = client.chat.completions.create(
            model=judge_model,
            messages=[{"role": "user", "content": judge_prompt}],
            temperature=0.1,
            max_tokens=120,
        )
        content = (response.choices[0].message.content or "").strip()
        return extract_json_block(content)
    except Exception as error:
        print(f"\n[ERROR] LLM Evaluation failed: {error}", flush=True)
        return {"accuracy": 0, "clarity": 0, "format": 0, "hallucination": 0}


def main():
    args = parse_args()
    input_file = resolve_input_file(args.model_type, args.input_file)
    output_file = resolve_output_file(args.model_type, args.output_file)

    if not os.path.exists(input_file):
        print(f"[ERROR] Inference results not found: {input_file}")
        print("Please run the inference script to generate model responses first.")
        sys.exit(1)

    client = build_client()
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    total_scores = {"accuracy": 0, "clarity": 0, "format": 0, "hallucination": 0}
    stability_metrics = {"json_valid_count": 0, "total_repetition_rate": 0.0}
    count = 0

    print("\n[START] LLM-as-a-Judge Evaluation", flush=True)
    print(f"- Reading from: {input_file}")

    with open(input_file, "r", encoding="utf-8") as input_stream, open(
        output_file,
        "w",
        encoding="utf-8",
    ) as output_stream:
        for line in input_stream:
            stripped = line.strip()
            if not stripped:
                continue

            record = json.loads(stripped)
            response_text = record.get("normalized_response") or record.get("raw_response", "")
            if not response_text:
                continue

            sys.stdout.write(f"\rEvaluating sample {count + 1}...")
            sys.stdout.flush()

            scores = score_with_llm(client, args.judge_model, record, response_text)
            
            # stability metrics 계산
            is_json_valid = scores.get("json_valid", False)
            rep_rate = calculate_repetition_rate(response_text)
            
            record["llm_judge_scores"] = scores
            record["stability_metrics"] = {
                "json_valid": is_json_valid,
                "repetition_rate": rep_rate
            }
            record["judge_model"] = args.judge_model
            output_stream.write(json.dumps(record, ensure_ascii=False) + "\n")

            total_scores["accuracy"] += scores.get("accuracy", 0)
            total_scores["clarity"] += scores.get("clarity", 0)
            total_scores["format"] += scores.get("format", 0)
            total_scores["hallucination"] += scores.get("hallucination", 0)
            
            if is_json_valid:
                stability_metrics["json_valid_count"] += 1
            stability_metrics["total_repetition_rate"] += rep_rate
            
            count += 1

    print("\n\n" + "=" * 50)
    print("🏆 [EVALUATION REPORT] 🏆")
    if count > 0:
        print(f"Total Samples: {count}")
        print(f"Avg Accuracy      : {total_scores['accuracy'] / count:.2f} / 10.0")
        print(f"Avg Clarity       : {total_scores['clarity'] / count:.2f} / 10.0")
        print(f"Avg Format        : {total_scores['format'] / count:.2f} / 10.0")
        print(f"Avg Hallucination : {total_scores['hallucination'] / count:.2f} / 10.0 (낮을수록 좋음)")
        
        print("\n🛡️ [STABILITY METRICS] 🛡️")
        print(f"JSON Validity Rate: {(stability_metrics['json_valid_count'] / count) * 100:.1f}%")
        print(f"Avg Repetition Rate: {(stability_metrics['total_repetition_rate'] / count) * 100:.1f}%")

        final_score = (
            total_scores["accuracy"] + total_scores["clarity"] + total_scores["format"]
        ) / (count * 3)
        print(f"\n>> ⭐️ FINAL AVERAGE SCORE: {final_score:.2f} / 10.0")
    else:
        print("No valid responses found to evaluate.")
    print("=" * 50)

    print(f"\n[SUCCESS] Detailed scores saved to: {output_file}")


if __name__ == "__main__":
    main()
