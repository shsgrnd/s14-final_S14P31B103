import argparse
import json
import os
from difflib import SequenceMatcher
from typing import Any, Dict

BASELINE_PATH = "packages/ai-pipeline/trainer/eval/results/llm_baseline_results_20260508_095241.jsonl"
SFT_RESULT_PATH = "packages/ai-pipeline/trainer/eval/results/sft_model_results.jsonl"
REPORT_PATH = "packages/ai-pipeline/trainer/eval/results/sft_performance_report.md"


def parse_args():
    parser = argparse.ArgumentParser(description="Compare two evaluation result JSONL files.")
    parser.add_argument("--baseline-path", type=str, default=BASELINE_PATH, help="기준 결과 JSONL")
    parser.add_argument("--candidate-path", type=str, default=SFT_RESULT_PATH, help="비교 대상 결과 JSONL")
    parser.add_argument("--baseline-label", type=str, default="baseline", help="기준 결과 표시 이름")
    parser.add_argument("--candidate-label", type=str, default="sft", help="비교 대상 표시 이름")
    parser.add_argument("--report-path", type=str, default=REPORT_PATH, help="마크다운 리포트 출력 경로")
    return parser.parse_args()


def calculate_similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, left, right).ratio() * 100


def load_records_by_case_id(file_path: str) -> Dict[str, Dict[str, Any]]:
    records: Dict[str, Dict[str, Any]] = {}
    with open(file_path, "r", encoding="utf-8") as file:
        for line in file:
            stripped = line.strip()
            if not stripped:
                continue
            record = json.loads(stripped)
            case_id = record.get("case_id")
            if case_id:
                records[case_id] = record
    return records


def resolve_response_text(record: Dict[str, Any]) -> str:
    # 새 평가 포맷에서는 normalized_response가 비교 기준입니다.
    # 예전 결과 파일이 들어와도 최대한 깨지지 않도록 fallback 순서를 둡니다.
    return (
        record.get("normalized_response")
        or record.get("raw_response")
        or record.get("response")
        or record.get("baseline_response")
        or record.get("sft_response")
        or record.get("dpo_response")
        or ""
    )


def resolve_reference_text(record: Dict[str, Any]) -> str:
    return record.get("chosen", "")


def resolve_judge_average(record: Dict[str, Any]) -> float | None:
    scores = record.get("llm_judge_scores")
    if not isinstance(scores, dict):
        return None
    accuracy = scores.get("accuracy")
    clarity = scores.get("clarity")
    fmt = scores.get("format")
    if not all(isinstance(value, (int, float)) for value in [accuracy, clarity, fmt]):
        return None
    return (accuracy + clarity + fmt) / 3


def build_metric_snapshot(record: Dict[str, Any]) -> Dict[str, float]:
    response_text = resolve_response_text(record)
    reference_text = resolve_reference_text(record)
    judge_average = resolve_judge_average(record)
    return {
        "similarity": calculate_similarity(response_text, reference_text),
        "json_ok": 1.0 if record.get("json_parse_ok") else 0.0,
        "exact_match": 1.0 if record.get("exact_json_match") else 0.0,
        "response_length": float(len(response_text)),
        "judge_average": judge_average if judge_average is not None else -1.0,
    }


def main():
    args = parse_args()
    print("[1/3] Loading result files...")
    if not os.path.exists(args.baseline_path) or not os.path.exists(args.candidate_path):
        print("[ERROR] Result files not found.")
        return

    baseline_records = load_records_by_case_id(args.baseline_path)
    candidate_records = load_records_by_case_id(args.candidate_path)
    common_case_ids = sorted(set(baseline_records) & set(candidate_records))

    if not common_case_ids:
        print("[ERROR] No overlapping case_id values found between the two files.")
        return

    print("[2/3] Analyzing performance...")
    baseline_totals = {
        "similarity": 0.0,
        "json_ok": 0.0,
        "exact_match": 0.0,
        "response_length": 0.0,
        "judge_average": 0.0,
    }
    candidate_totals = {
        "similarity": 0.0,
        "json_ok": 0.0,
        "exact_match": 0.0,
        "response_length": 0.0,
        "judge_average": 0.0,
    }
    baseline_judge_count = 0
    candidate_judge_count = 0
    comparison_details = []

    for index, case_id in enumerate(common_case_ids):
        baseline_snapshot = build_metric_snapshot(baseline_records[case_id])
        candidate_snapshot = build_metric_snapshot(candidate_records[case_id])

        for metric_name in baseline_totals:
            baseline_totals[metric_name] += baseline_snapshot[metric_name]
            candidate_totals[metric_name] += candidate_snapshot[metric_name]

        if baseline_snapshot["judge_average"] >= 0:
            baseline_judge_count += 1
        if candidate_snapshot["judge_average"] >= 0:
            candidate_judge_count += 1

        if index < 5:
            comparison_details.append(
                {
                    "case_id": case_id,
                    "baseline_similarity": baseline_snapshot["similarity"],
                    "candidate_similarity": candidate_snapshot["similarity"],
                    "similarity_diff": candidate_snapshot["similarity"] - baseline_snapshot["similarity"],
                }
            )

    total = len(common_case_ids)
    for metric_name in ["similarity", "json_ok", "exact_match", "response_length"]:
        baseline_totals[metric_name] /= total
        candidate_totals[metric_name] /= total

    if baseline_judge_count > 0:
        baseline_totals["judge_average"] /= baseline_judge_count
    if candidate_judge_count > 0:
        candidate_totals["judge_average"] /= candidate_judge_count

    print("[3/3] Generating Report...")
    os.makedirs(os.path.dirname(args.report_path), exist_ok=True)
    with open(args.report_path, "w", encoding="utf-8") as report:
        report.write("# 📊 Model Performance Comparison Report\n\n")
        report.write(
            f"본 리포트는 `{args.baseline_label}` 과 `{args.candidate_label}` 결과를 공통 `case_id` 기준으로 비교한 결과입니다.\n\n"
        )
        report.write(f"- Baseline file: `{args.baseline_path}`\n")
        report.write(f"- Candidate file: `{args.candidate_path}`\n")
        report.write(f"- Overlapped cases: `{total}`\n\n")

        report.write("## 1. 정량 지표 요약\n\n")
        report.write("| Metric | Baseline | Candidate | Diff |\n")
        report.write("| :--- | :---: | :---: | :---: |\n")
        report.write(
            f"| Similarity to chosen | {baseline_totals['similarity']:.2f}% | {candidate_totals['similarity']:.2f}% | {candidate_totals['similarity'] - baseline_totals['similarity']:+.2f}% |\n"
        )
        report.write(
            f"| JSON parse success | {baseline_totals['json_ok'] * 100:.2f}% | {candidate_totals['json_ok'] * 100:.2f}% | {(candidate_totals['json_ok'] - baseline_totals['json_ok']) * 100:+.2f}% |\n"
        )
        report.write(
            f"| Exact JSON match | {baseline_totals['exact_match'] * 100:.2f}% | {candidate_totals['exact_match'] * 100:.2f}% | {(candidate_totals['exact_match'] - baseline_totals['exact_match']) * 100:+.2f}% |\n"
        )
        report.write(
            f"| Avg. response length | {baseline_totals['response_length']:.1f}자 | {candidate_totals['response_length']:.1f}자 | {candidate_totals['response_length'] - baseline_totals['response_length']:+.1f}자 |\n"
        )
        if baseline_judge_count > 0 or candidate_judge_count > 0:
            baseline_judge_text = (
                f"{baseline_totals['judge_average']:.2f}/10.0" if baseline_judge_count > 0 else "n/a"
            )
            candidate_judge_text = (
                f"{candidate_totals['judge_average']:.2f}/10.0" if candidate_judge_count > 0 else "n/a"
            )
            judge_diff_text = (
                f"{candidate_totals['judge_average'] - baseline_totals['judge_average']:+.2f}"
                if baseline_judge_count > 0 and candidate_judge_count > 0
                else "n/a"
            )
            report.write(
                f"| Avg. LLM judge score | {baseline_judge_text} | {candidate_judge_text} | {judge_diff_text} |\n"
            )

        report.write("\n## 2. 샘플 케이스 비교\n\n")
        report.write("| Case ID | Baseline Similarity | Candidate Similarity | Diff |\n")
        report.write("| :--- | :---: | :---: | :---: |\n")
        for item in comparison_details:
            report.write(
                f"| {item['case_id']} | {item['baseline_similarity']:.1f}% | {item['candidate_similarity']:.1f}% | {item['similarity_diff']:+.1f}% |\n"
            )

        report.write("\n## 3. 해석 가이드\n\n")
        report.write("- Similarity는 `chosen` 기준의 문자열 유사도라, 의미는 맞지만 표현이 다른 응답에는 보수적으로 나올 수 있습니다.\n")
        report.write("- JSON parse success와 exact match는 구조 안정성을 보는 용도입니다.\n")
        report.write("- LLM judge score는 해당 파일에 `llm_judge_scores`가 있을 때만 집계됩니다.\n")

    print(f"\n[SUCCESS] Report generated at: {args.report_path}")


if __name__ == "__main__":
    main()
