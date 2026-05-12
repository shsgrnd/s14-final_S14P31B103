import os
import json
import argparse
from tqdm import tqdm
from openai import OpenAI
from dotenv import load_dotenv

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

# 부족한 특수 충돌 유형 정의
EXPANSION_TYPES = [
    "CI/CD Pipeline Conflict (e.g., GitHub Actions .yml)",
    "Database Migration & Schema Conflict (e.g., .sql, Prisma, TypeORM)",
    "Dependency & Package Conflict (e.g., package.json, pom.xml, requirements.txt)",
    "Configuration File Conflict (e.g., Dockerfile, docker-compose.yml, nginx.conf)"
]

def generate_synthetic_case(conflict_type):
    prompt = f"""당신은 시니어 개발자입니다. AI 모델 학습을 위한 고품질의 Git Merge Conflict 데이터를 생성해야 합니다.
반드시 아래의 특수한 충돌 유형에 대한 현실적인 예시를 만들어주세요.

[목표 충돌 유형]
{conflict_type}

다음 JSON 형식으로만 응답하세요. (마크다운 백틱 없이 순수 JSON만 출력)
{{
    "instruction": "이 Git 충돌 상황을 분석하고 해결책을 설명해줘.",
    "input": {{
        "base": "충돌 발생 전 원본 코드",
        "ours": "내가 수정한 코드 (A 기능 추가)",
        "theirs": "동료가 수정한 코드 (B 기능 추가)"
    }},
    "output": "충돌 원인에 대한 명확한 분석과, 두 코드를 안전하게 병합한 최종 해결 코드 및 설명"
}}
"""
    try:
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8, # 다양한 케이스를 위해 온도 높임
            max_tokens=1500
        )
        content = response.choices[0].message.content.strip()
        
        # JSON 블록 추출
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(0))
        return None
    except Exception as e:
        print(f"Generation error: {e}")
        return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=20, help="유형별 생성할 데이터 개수")
    args = parser.parse_args()
    
    output_file = os.path.join(BASE_DIR, "../data/synthetic_conflict_dataset.jsonl")
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    print("==========================================")
    print("🚀 Synthetic Data Expansion (분포 보정)")
    print("==========================================")
    
    new_data_count = 0
    with open(output_file, "a", encoding="utf-8") as fout:
        for c_type in EXPANSION_TYPES:
            print(f"\n[Generating] {c_type}...")
            for _ in tqdm(range(args.count)):
                case = generate_synthetic_case(c_type)
                if case:
                    fout.write(json.dumps(case, ensure_ascii=False) + "\n")
                    new_data_count += 1
                    
    print(f"\n[SUCCESS] Successfully appended {new_data_count} new specific conflict cases to dataset.")

if __name__ == "__main__":
    main()
