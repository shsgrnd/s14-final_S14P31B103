import argparse
import json
import os
from typing import Any, Dict, List, Optional


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "..", "synthetic_dataset"))
DEFAULT_OUTPUT_FILE = os.path.abspath(
    os.path.join(BASE_DIR, "..", "data", "dpo_training_data.jsonl")
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build DPO JSONL from synthetic_dataset prompt/chosen/(optional rejected).",
    )
    parser.add_argument(
        "--dataset-root",
        default=DATA_DIR,
        help="Synthetic dataset root directory. Defaults to repo synthetic_dataset/.",
    )
    parser.add_argument(
        "--output-file",
        default=DEFAULT_OUTPUT_FILE,
        help="Output JSONL path for DPO training.",
    )
    return parser.parse_args()


def find_case_folders(root_dir: str) -> List[str]:
    case_folders: List[str] = []

    for current_root, _, files in os.walk(root_dir):
        if "prompt.md" in files and "chosen.json" in files:
            case_folders.append(current_root)

    return sorted(case_folders)


def infer_feature_type(chosen_data: Dict[str, Any]) -> str:
    if "merged_code" in chosen_data or "diff_patch" in chosen_data:
        return "merge_patch_draft"
    if "recommended_option" in chosen_data:
        return "merge_mediation"
    if "cause_summary" in chosen_data:
        return "conflict_explanation"
    if "primary_text" in chosen_data and "alternative_texts" in chosen_data:
        return "recommendation"
    return "unknown"


def infer_recommendation_type(
    chosen_data: Dict[str, Any],
    case_relative_path: str,
) -> Optional[str]:
    explicit_type = chosen_data.get("recommendation_type")
    if isinstance(explicit_type, str):
        return explicit_type

    path_parts = case_relative_path.split(os.sep)
    if len(path_parts) >= 2 and path_parts[0] == "recommendation":
        return path_parts[1]

    return None


def infer_dataset_domain(case_relative_path: str) -> str:
    path_parts = case_relative_path.split(os.sep)
    if len(path_parts) >= 2 and path_parts[0] in {"merge", "recommendation"}:
        return path_parts[0]
    return "legacy"


def build_dpo_jsonl() -> None:
    args = parse_args()
    os.makedirs(os.path.dirname(args.output_file), exist_ok=True)

    case_folders = find_case_folders(args.dataset_root)

    if not case_folders:
        print("❌ synthetic_dataset 아래에서 케이스 폴더를 찾을 수 없습니다.")
        return

    success_count = 0
    skipped_count = 0
    missing_rejected_count = 0
    error_count = 0

    with open(args.output_file, "w", encoding="utf-8") as out_f:
        for folder in case_folders:
            prompt_path = os.path.join(folder, "prompt.md")
            chosen_path = os.path.join(folder, "chosen.json")
            rejected_path = os.path.join(folder, "rejected.json")

            try:
                with open(prompt_path, "r", encoding="utf-8") as pf:
                    prompt_text = pf.read().strip()

                with open(chosen_path, "r", encoding="utf-8") as cf:
                    chosen_data = json.load(cf)

                case_relative_path = os.path.relpath(folder, args.dataset_root)
                case_id = os.path.basename(folder)
                feature_type = infer_feature_type(chosen_data)
                recommendation_type = infer_recommendation_type(chosen_data, case_relative_path)
                dataset_domain = infer_dataset_domain(case_relative_path)

                if not os.path.exists(rejected_path):
                    print(f"⚠️ rejected.json 누락: {case_relative_path}")
                    missing_rejected_count += 1
                    skipped_count += 1
                    continue

                with open(rejected_path, "r", encoding="utf-8") as rf:
                    rejected_data: Dict[str, Any] = json.load(rf)

                jsonl_obj = {
                    "case_id": case_id,
                    "case_path": case_relative_path.replace(os.sep, "/"),
                    "dataset_domain": dataset_domain,
                    "feature_type": feature_type,
                    "recommendation_type": recommendation_type,
                    "prompt": prompt_text,
                    "chosen": json.dumps(chosen_data, ensure_ascii=False),
                    "rejected": json.dumps(rejected_data, ensure_ascii=False),
                }

                out_f.write(json.dumps(jsonl_obj, ensure_ascii=False) + "\n")
                success_count += 1

            except json.JSONDecodeError as error:
                print(f"❌ JSON 에러: {folder} - {error}")
                error_count += 1
            except Exception as error:
                print(f"❌ 처리 에러: {folder} - {error}")
                error_count += 1

    print("\n✅ DPO JSONL 빌드 완료!")
    print(f" - 성공: {success_count} 건")
    print(f" - skipped (missing rejected): {skipped_count} 건")
    print(f" - missing rejected files: {missing_rejected_count} 건")
    print(f" - 실패: {error_count} 건")
    print(f" - 출력 파일: {os.path.abspath(args.output_file)}")


if __name__ == "__main__":
    build_dpo_jsonl()
