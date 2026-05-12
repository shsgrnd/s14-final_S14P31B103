import os
import json
import sys
import re
import argparse
from openai import OpenAI
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 루트 .env 로드
load_dotenv(os.path.join(BASE_DIR, "../../../.env"))

API_KEY = os.getenv("GMS_KEY")
GMS_BASE_URL = os.getenv("GMS_BASE_URL", "https://gms.ssafy.io/gmsapi/")

def resolve_gms_url(base_url):
    base_url = base_url if base_url.endswith("/") else base_url + "/"
    if "api.openai.com" not in base_url:
        return f"{base_url}api.openai.com/v1"
    return base_url

try:
    client = OpenAI(api_key=API_KEY, base_url=resolve_gms_url(GMS_BASE_URL))
except Exception as e:
    print(f"[ERROR] OpenAI Client Init Failed. Check your GMS API key in .env")
    sys.exit(1)

def score_with_llm(prompt_text, model_response):
    """GPT-4o를 이용한 LLM-as-a-Judge 자동 채점"""
    
    judge_prompt = f"""당신은 AI 모델의 응답 품질을 엄격하게 평가하는 시니어 개발자입니다.
다음은 Git Merge Conflict 상황(Prompt)과 이에 대해 AI 모델이 내놓은 해결책(Response)입니다.
아래 3가지 지표를 1~10점 사이의 정수로 평가하고, 결과만 반드시 JSON 형식으로 응답하세요.

[지표 설명]
1. accuracy: 충돌 원인 분석이 정확하며, 제시된 코드 해결책이 기술적으로 타당한가? (1-10)
2. clarity: 설명의 흐름이 자연스럽고, 주니어 개발자도 이해할 수 있을 만큼 명확하고 친절한가? (1-10)
3. format: 마크다운 포맷, 코드 블록 등이 읽기 쉽게 잘 구조화되어 있는가? (1-10)

[Prompt (Git Conflict)]
{prompt_text}

[Model Response]
{model_response}

[출력 예시]
{{"accuracy": 8, "clarity": 9, "format": 10}}
"""
    try:
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[{"role": "user", "content": judge_prompt}],
            temperature=0.1, # 일관된 채점을 위해 온도를 낮춤
            max_tokens=100
        )
        content = response.choices[0].message.content.strip()
        
        # JSON 부분만 파싱 (가끔 백틱을 포함해서 응답할 수 있으므로)
        json_match = re.search(r'\{.*?\}', content, re.DOTALL)
        if json_match:
            score_data = json.loads(json_match.group(0))
            return score_data
        else:
            return {"accuracy": 0, "clarity": 0, "format": 0}
            
    except Exception as e:
        print(f"\n[ERROR] LLM Evaluation failed: {e}", flush=True)
        return {"accuracy": 0, "clarity": 0, "format": 0}


def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate model responses using GPT-4o.")
    parser.add_argument("--model-type", type=str, choices=["base", "sft", "dpo"], required=True,
                        help="평가할 모델의 종류 (base, sft, dpo)")
    return parser.parse_args()

def main():
    args = parse_args()
    
    # run_eval_inference.py 가 만들어낸 모델 답변 파일을 읽습니다.
    input_file = os.path.join(BASE_DIR, f"../trainer/eval/results/{args.model_type}_model_results.jsonl")
    output_file = os.path.join(BASE_DIR, f"../trainer/eval/results/{args.model_type}_llm_judge_scores.jsonl")
    
    if not os.path.exists(input_file):
        print(f"[ERROR] Inference results not found: {input_file}")
        print("Please run the inference script to generate model responses first.")
        sys.exit(1)
        
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    total_scores = {"accuracy": 0, "clarity": 0, "format": 0}
    count = 0
    
    print(f"\n[START] LLM-as-a-Judge Evaluation", flush=True)
    print(f"- Reading from: {input_file}")
    
    with open(input_file, 'r', encoding='utf-8') as fin, open(output_file, 'w', encoding='utf-8') as fout:
        for line in fin:
            if not line.strip():
                continue
                
            data = json.loads(line)
            prompt = data.get('input', '')
            response = data.get(f'{args.model_type}_response', '')
            
            if not response:
                continue
                
            sys.stdout.write(f"\rEvaluating sample {count+1}...")
            sys.stdout.flush()
            
            scores = score_with_llm(prompt, response)
            
            # 결과 저장
            data['llm_judge_scores'] = scores
            fout.write(json.dumps(data, ensure_ascii=False) + "\n")
            
            total_scores['accuracy'] += scores.get('accuracy', 0)
            total_scores['clarity'] += scores.get('clarity', 0)
            total_scores['format'] += scores.get('format', 0)
            count += 1
            
    print("\n\n" + "="*50)
    print("🏆 [EVALUATION REPORT] 🏆")
    if count > 0:
        print(f"Total Samples: {count}")
        print(f"Avg Accuracy : {total_scores['accuracy']/count:.2f} / 10.0")
        print(f"Avg Clarity  : {total_scores['clarity']/count:.2f} / 10.0")
        print(f"Avg Format   : {total_scores['format']/count:.2f} / 10.0")
        
        final_score = (total_scores['accuracy'] + total_scores['clarity'] + total_scores['format']) / (count * 3)
        print(f"\n>> ⭐️ FINAL AVERAGE SCORE: {final_score:.2f} / 10.0")
    else:
        print("No valid responses found to evaluate.")
    print("="*50)
    
    print(f"\n[SUCCESS] Detailed scores saved to: {output_file}")

if __name__ == "__main__":
    main()
