import os
import json
import sys
import re
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
    prompt = f"""너는 고품질 AI 학습 데이터를 생성하는 전문가야.
Git 충돌(Merge Conflict) 상황에 대한 '설명' 모델을 학습시키기 위한 데이터를 만들어줘.

[카테고리]: {category}

[요구사항]
1. 충돌 데이터(Input): Ours, Theirs, Base 코드가 포함된 기술적인 충돌 상황을 상세히 작성해줘.
2. 모범 답안(Output): 시니어 개발자가 후배에게 설명하듯, 충돌 원인을 분석하고 최선의 해결책을 한국어로 제안해줘.

[출력 형식]
반드시 아래 태그 형식을 지켜서 작성해줘. (JSON이 아님)

[INPUT_START]
(여기에 Ours, Theirs, Base 코드를 포함한 충돌 상황 작성)
[INPUT_END]

[OUTPUT_START]
(여기에 전문가급 상세 설명 및 해결책 작성)
[OUTPUT_END]
"""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            timeout=60,
            max_tokens=3000
        )
        content = response.choices[0].message.content
        
        # 태그 기반 파싱
        input_data = re.search(r'\[INPUT_START\](.*?)\[INPUT_END\]', content, re.DOTALL)
        output_data = re.search(r'\[OUTPUT_START\](.*?)\[OUTPUT_END\]', content, re.DOTALL)
        
        if input_data and output_data:
            return {
                "instruction": "이 Git 충돌 상황을 분석하고 해결책을 설명해줘.",
                "input": input_data.group(1).strip(),
                "output": output_data.group(1).strip()
            }
        else:
            print(f"\n[ERROR] Tag parsing failed for {category}", flush=True)
            return None
    except Exception as e:
        print(f"\n[ERROR] API call failed: {e}", flush=True)
        return None

def main():
    categories = [
        "React Hook Dependency Conflict",
        "Tailwind CSS / Styling Conflict",
        "API Endpoint Versioning (v1 vs v2) Conflict",
        "TypeScript Interface/Type Definition Conflict",
        "Business Logic / Redux State Logic Conflict",
        "Database Schema / Prisma Migration Conflict",
        "Security Middleware / Auth Logic Conflict",
        "Docker / CI/CD Config Conflict",
        "Unit Test / Jest Mocking Conflict",
        "NPM Package Version (package.json) Conflict"
    ]
    
    output_path = os.path.join(BASE_DIR, "../data/sft_training_data.jsonl")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    print(f"[START] SFT Data Completion (Tag-based Parsing Mode)", flush=True)

    count = 0
    for cat in categories:
        print(f"\n[CATEGORY] {cat}", flush=True)
        for i in range(5): # 각 5개씩 다시 시도 (안정성 확보)
            case = generate_sft_case(cat)
            if case:
                with open(output_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(case, ensure_ascii=False) + "\n")
                count += 1
                sys.stdout.write(".")
                sys.stdout.flush()
    
    print(f"\n\n[SUCCESS] Total {count} cases generated at: {output_path}", flush=True)

if __name__ == "__main__":
    main()
