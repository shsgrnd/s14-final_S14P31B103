"""
analyze_eval_results.py
========================
명세서 요구사항:
- [비교 지표 산출 자동화] Pass@1, Similarity 계산
- [실패 케이스 샘플 자동 추출]

evaluate_llm_judge.py 가 생성한 채점 결과를 읽어
아래 두 작업을 한 번에 수행합니다.

1. Pass@1 : accuracy >= 7 이면 '합격(Pass)'으로 간주
2. Similarity : 모델 응답과 정답(ground_truth) 간 텍스트 유사도 (0.0~1.0)
3. Fail-Case 추출 : 평균 점수 < threshold 또는 accuracy <= 5 인 케이스를
   별도 Markdown 파일로 정리하여 팀원 A가 취약점을 분석할 수 있도록 제공

산출물:
- {model_type}_analyzed_results.jsonl  (Pass@1, Similarity 등 지표가 추가된 상세 결과)
- {model_type}_fail_cases.md           (실패 케이스 오답 노트)
"""
import os
import json
import argparse
from difflib import SequenceMatcher
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(BASE_DIR, "../trainer/eval/results")

PASS_THRESHOLD = 7    # accuracy 점수 합격 기준
FAIL_THRESHOLD = 6.0  # 평균 점수 실패 기준

def compute_similarity(text_a: str, text_b: str) -> float:
    """두 텍스트의 유사도를 0.0~1.0으로 반환 (Python 표준 라이브러리 사용)."""
    if not text_a or not text_b:
        return 0.0
    return SequenceMatcher(None, text_a, text_b).ratio()

def parse_args():
    parser = argparse.ArgumentParser(
        description="Compute Pass@1, Similarity and extract fail cases from LLM judge results."
    )
    parser.add_argument("--model-type", type=str, choices=["base", "sft", "dpo"], required=True,
                        help="분석할 모델 종류 (base, sft, dpo)")
    return parser.parse_args()

def main():
    args = parse_args()

    input_file   = os.path.join(RESULTS_DIR, f"{args.model_type}_llm_judge_scores.jsonl")
    output_file  = os.path.join(RESULTS_DIR, f"{args.model_type}_analyzed_results.jsonl")
    fail_md_file = os.path.join(RESULTS_DIR, f"{args.model_type}_fail_cases.md")

    if not os.path.exists(input_file):
        print(f"[ERROR] Judge score file not found: {input_file}")
        print("Please run evaluate_llm_judge.py first.")
        return

    os.makedirs(RESULTS_DIR, exist_ok=True)

    total_pass, total_sim, count = 0, 0.0, 0
    fail_cases = []

    print(f"\n[START] Analyzing eval results for [{args.model_type.upper()}]...")

    with open(input_file, "r", encoding="utf-8") as fin, \
         open(output_file, "w", encoding="utf-8") as fout:

        for line in fin:
            if not line.strip():
                continue

            data     = json.loads(line)
            scores   = data.get("llm_judge_scores", {})
            acc      = scores.get("accuracy", 0)
            clarity  = scores.get("clarity", 0)
            fmt      = scores.get("format", 0)
            avg      = (acc + clarity + fmt) / 3.0

            model_resp   = data.get(f"{args.model_type}_response", "")
            ground_truth = data.get("ground_truth", "")

            # ── 지표 계산 ──────────────────────────────
            is_pass  = 1 if acc >= PASS_THRESHOLD else 0
            sim      = compute_similarity(model_resp, ground_truth)

            data["pass_at_1"]  = is_pass
            data["similarity"] = round(sim, 4)
            fout.write(json.dumps(data, ensure_ascii=False) + "\n")

            total_pass += is_pass
            total_sim  += sim
            count      += 1

            # ── 실패 케이스 수집 ───────────────────────
            if avg < FAIL_THRESHOLD or acc <= 5:
                fail_cases.append({
                    "instruction": data.get("instruction", ""),
                    "input":       data.get("input", ""),
                    "response":    model_resp,
                    "scores":      scores,
                    "avg":         avg,
                    "similarity":  sim,
                })

    if count == 0:
        print("[ERROR] No records found.")
        return

    pass_rate = (total_pass / count) * 100
    avg_sim   = total_sim / count

    # ── 터미널 요약 출력 ───────────────────────────────
    print("\n" + "="*50)
    print(f"📐 [{args.model_type.upper()}] Metrics Summary")
    print(f"  Total Samples : {count}")
    print(f"  Pass@1        : {total_pass}/{count} ({pass_rate:.1f}%)")
    print(f"  Avg Similarity: {avg_sim:.4f}")
    print(f"  Fail Cases    : {len(fail_cases)}")
    print("="*50)

    # ── 실패 케이스 Markdown 생성 ─────────────────────
    with open(fail_md_file, "w", encoding="utf-8") as fout:
        fout.write(f"# 🚨 {args.model_type.upper()} Model Fail-Case Report\n")
        fout.write(f"**Generated At:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        fout.write(f"**Total Fail Cases:** {len(fail_cases)}\n")
        fout.write(f"**Criteria:** Average Score < {FAIL_THRESHOLD} OR Accuracy ≤ 5\n\n---\n\n")

        for idx, case in enumerate(fail_cases, 1):
            fout.write(f"## 🔻 Case {idx}\n")
            fout.write(f"- **Accuracy:** {case['scores'].get('accuracy')}/10\n")
            fout.write(f"- **Clarity:** {case['scores'].get('clarity')}/10\n")
            fout.write(f"- **Format:** {case['scores'].get('format')}/10\n")
            fout.write(f"- **Average:** {case['avg']:.2f}/10  |  "
                       f"**Similarity:** {case['similarity']:.4f}\n\n")
            fout.write("### ❓ Problem (Input)\n")
            fout.write("```json\n" + case["input"] + "\n```\n\n")
            fout.write("### ❌ AI Response\n")
            fout.write(case["response"] + "\n\n---\n\n")

    print(f"[SUCCESS] Detailed results → {output_file}")
    print(f"[SUCCESS] Fail-case report → {fail_md_file}")

if __name__ == "__main__":
    main()
