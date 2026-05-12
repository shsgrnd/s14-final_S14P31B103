import os
import json
import argparse
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def parse_args():
    parser = argparse.ArgumentParser(description="Extract fail cases from LLM evaluation results.")
    parser.add_argument("--model-type", type=str, choices=["base", "sft", "dpo"], required=True,
                        help="실패 케이스를 추출할 모델 (base, sft, dpo)")
    parser.add_argument("--threshold", type=float, default=6.0,
                        help="이 점수 미만인 경우 실패 케이스로 간주 (기본값: 6.0)")
    return parser.parse_args()

def main():
    args = parse_args()
    
    input_file = os.path.join(BASE_DIR, f"../trainer/eval/results/{args.model_type}_llm_judge_scores.jsonl")
    output_file = os.path.join(BASE_DIR, f"../trainer/eval/results/{args.model_type}_fail_cases.md")
    
    if not os.path.exists(input_file):
        print(f"[ERROR] Judge scores not found: {input_file}")
        print("Please run evaluate_llm_judge.py first.")
        return
        
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    fail_cases = []
    
    print(f"[START] Extracting fail cases for {args.model_type.upper()} model...")
    
    with open(input_file, 'r', encoding='utf-8') as fin:
        for line in fin:
            if not line.strip():
                continue
                
            data = json.loads(line)
            scores = data.get('llm_judge_scores', {})
            
            acc = scores.get('accuracy', 0)
            clarity = scores.get('clarity', 0)
            fmt = scores.get('format', 0)
            avg_score = (acc + clarity + fmt) / 3.0
            
            # 실패 조건: 평균 점수가 기준치(Threshold) 미만이거나, 정확성이 5점 이하인 치명적 오류
            if avg_score < args.threshold or acc <= 5:
                fail_cases.append({
                    "instruction": data.get("instruction", ""),
                    "input": data.get("input", ""),
                    "response": data.get(f"{args.model_type}_response", ""),
                    "scores": scores,
                    "avg": avg_score
                })
                
    # 사람이 읽기 편한 Markdown 형식으로 리포트 작성
    with open(output_file, 'w', encoding='utf-8') as fout:
        fout.write(f"# 🚨 {args.model_type.upper()} Model Fail-Case Report\n")
        fout.write(f"**Generated At:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        fout.write(f"**Total Fail Cases:** {len(fail_cases)}\n")
        fout.write(f"**Criteria:** Average Score < {args.threshold} OR Accuracy <= 5\n\n")
        fout.write("---\n\n")
        
        for idx, case in enumerate(fail_cases, 1):
            fout.write(f"## 🔻 Case {idx}\n")
            fout.write(f"- **Accuracy:** {case['scores'].get('accuracy')}/10\n")
            fout.write(f"- **Clarity:** {case['scores'].get('clarity')}/10\n")
            fout.write(f"- **Format:** {case['scores'].get('format')}/10\n")
            fout.write(f"- **Average:** {case['avg']:.2f}/10\n\n")
            
            fout.write("### ❓ Problem (Input)\n")
            fout.write("```json\n" + case['input'] + "\n```\n\n")
            
            fout.write("### ❌ AI Response\n")
            fout.write(case['response'] + "\n\n")
            fout.write("---\n\n")

    print(f"[SUCCESS] Extracted {len(fail_cases)} fail cases.")
    print(f"Report saved to: {output_file}")

if __name__ == "__main__":
    main()
