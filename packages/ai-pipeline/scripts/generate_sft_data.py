import os
import json
from openai import OpenAI
from dotenv import load_dotenv

# 루트 .env 로드
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, "../../../.env"))

API_KEY = os.getenv("GMS_KEY")
GMS_BASE_URL = os.getenv("GMS_BASE_URL", "https://gms.ssafy.io/gmsapi/")

def resolve_gms_url(base_url):
    base_url = base_url if base_url.endswith("/") else base_url + "/"
    if "api.openai.com" not in base_url:
        return f"{base_url}api.openai.com/v1"
    return base_url

client = OpenAI(api_key=API_KEY, base_url=resolve_gms_url(GMS_BASE_URL))

def generate_sft_case(category):
    """특정 카테고리의 Git 충돌 케이스와 모범 답안을 생성합니다."""
    prompt = f"""너는 고품질 AI 학습 데이터를 생성하는 전문가야.
Git 충돌(Merge Conflict) 상황에 대한 '설명' 모델을 학습시키기 위한 데이터를 만들어줘.

[카테고리]: {category}

[요구사항]
1. 충돌 데이터(Input): Ours, Theirs, Base 코드가 포함된 기술적인 충돌 상황을 만들어줘.
2. 모범 답안(Output): 시니어 개발자가 후배에게 설명하듯, 충돌 원인을 분석하고 최선의 해결책을 한국어로 제안해줘.
3. 톤앤매너: 전문적이고, 논리적이며, 친절해야 함.

[출력 형식]
반드시 아래 JSON 형식으로만 응답해줘.
{{
  "instruction": "이 Git 충돌 상황을 분석하고 해결책을 설명해줘.",
  "input": "충돌 코드 데이터 (Ours/Theirs/Base 포함)",
  "output": "전문가급 상세 설명 및 해결책"
}}
"""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"Error generating case: {e}")
        return None

def main():
    categories = [
        "React Hook Dependency Conflict",
        "CSS Class Name Conflict in Tailwind",
        "API Endpoint Version Conflict",
        "Interface/Type Definition Conflict in TS",
        "Business Logic Branching Conflict"
    ]
    
    all_data = []
    print(f"[START] Starting SFT data generation... (Categories: {len(categories)})")

    for cat in categories:
        print(f"[GENERATING] Creating scenario for: '{cat}'")
        # 각 카테고리당 2개씩 샘플 생성 (테스트용)
        for i in range(2):
            case = generate_sft_case(cat)
            if case:
                all_data.append(case)

    # JSONL 형식으로 저장
    output_path = os.path.join(BASE_DIR, "../data/sft_training_data.jsonl")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8") as f:
        for entry in all_data:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            
    print(f"\n[COMPLETE] Data generation finished! Total {len(all_data)} cases created.")
    print(f"[SAVE] Path: {output_path}")

if __name__ == "__main__":
    main()
