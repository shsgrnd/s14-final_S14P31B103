"""
compute_metrics.py
==================
명세서 요구사항 [비교 지표 산출 자동화]:
- Pass@1: 모델이 한 번의 시도로 '합격 수준' 답변을 만들어냈는지 여부 (accuracy >= 7)
- Similarity: 모델 응답과 정답(ground truth) 사이의 텍스트 유사도 (0.0 ~ 1.0)
- LLM-as-a-Judge 점수는 별도 스크립트(evaluate_llm_judge.py)로 산출하며,
  이 스크립트는 그 결과를 불러와 Pass@1과 Similarity를 추가 계산합니다.
"""
import os
import json
import argparse
from difflib import SequenceMatcher

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

PASS_THRESHOLD = 7  # accuracy 점수가 이 이상이면 Pass로 간주

def compute_similarity(text_a: str, text_b: str) -> float:
    """두 텍스트 사이의 유사도를 0.0~1.0으로 반환 (difflib 기반)."""
    if not text_a or not text_b:
        return 0.0
    return SequenceMatcher(None, text_a, text_b).ratio()

def parse_args():
    parser = argparse.ArgumentParser(description="Compute Pass@1 and Similarity metrics.")
    parser.add_argument("--model-type", type=str, choices=["base", "sft", "dpo"], required=True,
                        help="지표를 계산할 모델 종류 (base, sft, dpo)")
    return parser.parse_args()

def main():
    args = parse_args()

    # evaluate_llm_judge.py 가 만들어낸 채점 파일을 입력으로 받습니다.
    judge_file  = os.path.join(BASE_DIR, f"../trainer/eval/results/{args.model_type}_llm_judge_scores.jsonl")
    output_file = os.path.join(BASE_DIR, f"../trainer/eval/results/{args.model_type}_final_metrics.jsonl")
    summary_file = os.path.join(BASE_DIR, f"../trainer/eval/results/{args.model_type}_metrics_summary.md")

    if not os.path.exists(judge_file):
        print(f"[ERROR] Judge score file not found: {judge_file}")
        print("Please run evaluate_llm_judge.py first.")
        return

    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    total_pass = 0
    total_similarity = 0.0
    count = 0

    print(f"\n[START] Computing Pass@1 & Similarity for [{args.model_type.upper()}] model...")

    with open(judge_file, "r", encoding="utf-8") as fin, \
         open(output_file, "w", encoding="utf-8") as fout:

        for line in fin:
            if not line.strip():
                continue

            data = json.loads(line)
            scores = data.get("llm_judge_scores", {})
            accuracy = scores.get("accuracy", 0)

            model_response = data.get(f"{args.model_type}_response", "")
            ground_truth   = data.get("ground_truth", "")

            # Pass@1: accuracy 점수가 기준점 이상이면 합격
            is_pass = 1 if accuracy >= PASS_THRESHOLD else 0

            # Similarity: 모델 답변과 정답 사이의 텍스트 유사도
            similarity = compute_similarity(model_response, ground_truth)

            data["pass_at_1"]   = is_pass
            data["similarity"]  = round(similarity, 4)

            fout.write(json.dumps(data, ensure_ascii=False) + "\n")

            total_pass      += is_pass
            total_similarity += similarity
            count += 1

    if count == 0:
        print("[ERROR] No records found in judge file.")
        return

    pass_rate   = (total_pass / count) * 100
    avg_sim     = total_similarity / count

    # Markdown 요약 출력
    summary = f"""# 📐 {args.model_type.upper()} Model — Metrics Summary

| Metric | Value |
| :--- | :---: |
| **Total Samples** | {count} |
| **Pass@1** | {total_pass}/{count} ({pass_rate:.1f}%) |
| **Avg Similarity** | {avg_sim:.4f} |

> - **Pass@1**: LLM Judge accuracy 점수 ≥ {PASS_THRESHOLD} 인 비율  
> - **Similarity**: 모델 답변과 ground truth 간 SequenceMatcher 기반 텍스트 유사도
"""
    with open(summary_file, "w", encoding="utf-8") as sf:
        sf.write(summary)

    print("\n" + "="*50)
    print(f"📐 [{args.model_type.upper()}] Metrics Report")
    print(f"  Pass@1      : {total_pass}/{count} ({pass_rate:.1f}%)")
    print(f"  Avg Sim     : {avg_sim:.4f}")
    print("="*50)
    print(f"\n[SUCCESS] Detailed results → {output_file}")
    print(f"[SUCCESS] Summary report  → {summary_file}")

if __name__ == "__main__":
    main()
