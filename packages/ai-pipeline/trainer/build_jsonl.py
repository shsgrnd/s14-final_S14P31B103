import json
import os
from typing import Any, Dict, List, Optional

# 설정
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "..", "synthetic_dataset"))
OUTPUT_FILE = os.path.abspath(
    os.path.join(BASE_DIR, "..", "data", "synthetic_conflict_dataset.jsonl")
)


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


def build_jsonl():
    # 저장될 outputs 폴더 확인/생성
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    # prompt.md + chosen.json을 동시에 가진 모든 케이스 폴더를 재귀 탐색
    case_folders = find_case_folders(DATA_DIR)

    if not case_folders:
        print("❌ synthetic_dataset 아래에서 케이스 폴더를 찾을 수 없습니다.")
        return

    success_count = 0
    error_count = 0

    with open(OUTPUT_FILE, "w", encoding="utf-8") as out_f:
        for folder in case_folders:
            prompt_path = os.path.join(folder, "prompt.md")
            chosen_path = os.path.join(folder, "chosen.json")

            try:
                # 1. Prompt.md 읽기
                with open(prompt_path, "r", encoding="utf-8") as pf:
                    prompt_text = pf.read().strip()

                # 2. Chosen.json 읽기 및 검증
                with open(chosen_path, "r", encoding="utf-8") as cf:
                    chosen_data = json.load(cf)

                case_relative_path = os.path.relpath(folder, DATA_DIR)
                case_id = os.path.basename(folder)
                feature_type = infer_feature_type(chosen_data)
                recommendation_type = infer_recommendation_type(chosen_data, case_relative_path)
                dataset_domain = infer_dataset_domain(case_relative_path)

                # 3. JSONL 포맷으로 병합
                # chosen 필드는 파서가 읽을 수 있도록 문자열화된 JSON이어야 합니다.
                jsonl_obj = {
                    "case_id": case_id,
                    "case_path": case_relative_path.replace(os.sep, "/"),
                    "dataset_domain": dataset_domain,
                    "feature_type": feature_type,
                    "recommendation_type": recommendation_type,
                    "prompt": prompt_text,
                    "chosen": json.dumps(chosen_data, ensure_ascii=False),
                }

                # 4. 파일에 쓰기
                out_f.write(json.dumps(jsonl_obj, ensure_ascii=False) + "\n")
                success_count += 1

            except json.JSONDecodeError as error:
                print(
                    f"❌ 에러: {chosen_path} 파일의 JSON 문법이 틀렸습니다! "
                    f"(콤마, 따옴표 확인) - {error}"
                )
                error_count += 1
            except Exception as error:
                print(f"❌ 에러: {folder} 처리 중 알 수 없는 오류 발생 - {error}")
                error_count += 1

    print("\n✅ JSONL 빌드 완료!")
    print(f" - 성공: {success_count} 건")
    print(f" - 실패: {error_count} 건")
    print(f" - 출력 파일: {os.path.abspath(OUTPUT_FILE)}")


if __name__ == "__main__":
    build_jsonl()
