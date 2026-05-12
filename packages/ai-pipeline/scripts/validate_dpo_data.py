import json
import os
import sys


def normalize_text(value):
    # DPO 데이터는 최종적으로 문자열 길이와 중복 여부를 봐야 하므로,
    # dict/list가 들어온 경우에도 비교 가능한 문자열 형태로 먼저 맞춥니다.
    if isinstance(value, str):
        return value.strip()
    return json.dumps(value, ensure_ascii=False).strip()


def validate_dpo_data(file_path):
    print(f"[START] Validating DPO data: {file_path}", flush=True)

    if not os.path.exists(file_path):
        print(f"[ERROR] File not found: {file_path}", flush=True)
        return

    success_count = 0
    error_count = 0
    duplicate_count = 0
    total_prompt_len = 0
    total_chosen_len = 0
    total_rejected_len = 0

    with open(file_path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            line_num = i + 1
            try:
                data = json.loads(line)

                # DPO는 prompt/chosen/rejected 3개 축이 모두 있어야 합니다.
                # 하나라도 빠지면 "선호도 비교 학습" 자체가 성립하지 않으므로 즉시 실패 처리합니다.
                required_fields = ["prompt", "chosen", "rejected"]
                missing_fields = [field for field in required_fields if field not in data]

                if missing_fields:
                    print(f"[FAIL] Line {line_num}: Missing fields {missing_fields}", flush=True)
                    error_count += 1
                    continue

                prompt_str = normalize_text(data["prompt"])
                chosen_str = normalize_text(data["chosen"])
                rejected_str = normalize_text(data["rejected"])

                # 지나치게 짧은 값은 잘린 데이터거나 export 오류일 가능성이 높습니다.
                # 학습 전에 이런 샘플을 먼저 걸러야 GPU 시간을 낭비하지 않습니다.
                if len(prompt_str) < 5:
                    print(f"[FAIL] Line {line_num}: Prompt too short", flush=True)
                    error_count += 1
                    continue

                if len(chosen_str) < 10 or len(rejected_str) < 10:
                    print(
                        f"[FAIL] Line {line_num}: Preference text too short "
                        f"(chosen={len(chosen_str)}, rejected={len(rejected_str)})",
                        flush=True,
                    )
                    error_count += 1
                    continue

                # chosen과 rejected가 완전히 같으면 DPO 입장에서는 "무엇을 더 선호해야 하는지"
                # 학습 신호가 사라지므로, 일단 경고로 집계해 사람이 다시 확인할 수 있게 남깁니다.
                if chosen_str == rejected_str:
                    print(f"[WARN] Line {line_num}: chosen and rejected are identical", flush=True)
                    duplicate_count += 1

                success_count += 1
                total_prompt_len += len(prompt_str)
                total_chosen_len += len(chosen_str)
                total_rejected_len += len(rejected_str)

            except json.JSONDecodeError as e:
                print(f"[FAIL] Line {line_num}: Invalid JSON format - {e}", flush=True)
                error_count += 1

    print("\n[SUMMARY]", flush=True)
    print(f" - Total Records: {success_count + error_count}", flush=True)
    print(f" - Valid Records: {success_count}", flush=True)
    print(f" - Invalid Records: {error_count}", flush=True)
    print(f" - Duplicate Preference Pairs: {duplicate_count}", flush=True)

    if success_count > 0:
        print(f" - Avg Prompt Length: {total_prompt_len / success_count:.1f} chars", flush=True)
        print(f" - Avg Chosen Length: {total_chosen_len / success_count:.1f} chars", flush=True)
        print(f" - Avg Rejected Length: {total_rejected_len / success_count:.1f} chars", flush=True)

    if error_count == 0:
        print("\n[RESULT] SUCCESS: All data passed technical validation.", flush=True)
    else:
        print(f"\n[RESULT] FAILED: Found {error_count} errors.", flush=True)


if __name__ == "__main__":
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATA_PATH = os.path.join(BASE_DIR, "../data/dpo_training_data.jsonl")

    # 기본 경로는 레포 기준 dpo_training_data.jsonl이지만,
    # GPU 서버에서 별도 경로나 임시 샘플 파일을 검증할 수 있게 CLI 인자도 허용합니다.
    if len(sys.argv) > 1:
        DATA_PATH = sys.argv[1]

    validate_dpo_data(DATA_PATH)
