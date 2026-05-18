import json
import os
import argparse
from typing import List, Dict, Any
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
        raise RuntimeError("GMS_KEY is required to generate rejection samples")
    return OpenAI(api_key=API_KEY, base_url=resolve_gms_url(GMS_BASE_URL))

def generate_improved_response(client: OpenAI, record: Dict[str, Any]) -> str:
    prompt = record.get("prompt", "")
    ground_truth = record.get("chosen", "")
    
    system_prompt = "당신은 세계 최고의 AI 코딩 어시스턴트입니다. 사용자의 요청에 대해 완벽하고 정확하며 최신 코딩 컨벤션을 준수하는 JSON 응답을 생성해야 합니다."
    user_content = f"""[User Prompt]
{prompt}

[Ground Truth Hint]
{ground_truth}

[Task]
위의 요청에 대해 가장 완벽한 답변을 생성해 주세요. 
반드시 JSON 형식을 포함해야 하며, 설명은 간결하고 명확해야 합니다.
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o", # 고성능 모델 사용
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            temperature=0.2,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Error generating response for {record.get('case_id')}: {e}")
        return ""

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-file", required=True, help="Path to evaluation scores jsonl")
    parser.add_argument("--output-file", default="packages/ai-pipeline/data/rejection_sampling_data.jsonl")
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()

    client = build_client()
    
    fail_cases = []
    with open(args.input_file, "r", encoding="utf-8") as f:
        for line in f:
            record = json.loads(line)
            scores = record.get("llm_judge_scores", {})
            
            # 실패 사례 조건: 정확도 5 미만 또는 JSON 파싱 실패
            is_fail = scores.get("accuracy", 10) < 6 or record.get("json_parse_ok") is False
            
            if is_fail:
                fail_cases.append(record)

    print(f"Found {len(fail_cases)} fail cases. Processing top {args.limit}...")
    
    results = []
    for i, record in enumerate(fail_cases[:args.limit]):
        print(f"[{i+1}/{args.limit}] Generating improved response for {record.get('case_id')}...")
        improved = generate_improved_response(client, record)
        if improved:
            dpo_pair = {
                "prompt": record["prompt"],
                "chosen": improved,
                "rejected": record["raw_response"],
                "dataset_domain": record.get("dataset_domain"),
                "feature_type": record.get("feature_type"),
                "case_id": record.get("case_id"),
                "source": "rejection_sampling"
            }
            results.append(dpo_pair)

    os.makedirs(os.path.dirname(args.output_file), exist_ok=True)
    with open(args.output_file, "w", encoding="utf-8") as f:
        for res in results:
            f.write(json.dumps(res, ensure_ascii=False) + "\n")
            
    print(f"Successfully saved {len(results)} rejection samples to {args.output_file}")

if __name__ == "__main__":
    main()
