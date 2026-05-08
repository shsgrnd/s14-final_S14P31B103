import json
import os
import sys

def validate_sft_data(file_path):
    print(f"[START] Validating SFT data: {file_path}", flush=True)
    
    if not os.path.exists(file_path):
        print(f"[ERROR] File not found: {file_path}", flush=True)
        return

    success_count = 0
    error_count = 0
    total_input_len = 0
    total_output_len = 0
    
    with open(file_path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            line_num = i + 1
            try:
                data = json.loads(line)
                
                # 1. 필수 필드 존재 여부 확인
                required_fields = ["instruction", "input", "output"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    print(f"[FAIL] Line {line_num}: Missing fields {missing_fields}", flush=True)
                    error_count += 1
                    continue
                
                # 2. 내용 유효성 확인
                input_str = str(data["input"])
                output_str = str(data["output"])
                
                if len(input_str) < 5 or len(output_str) < 10:
                    print(f"[WARN] Line {line_num}: Content suspicious (Input len: {len(input_str)}, Output len: {len(output_str)})", flush=True)
                
                success_count += 1
                total_input_len += len(input_str)
                total_output_len += len(output_str)
                
            except json.JSONDecodeError as e:
                print(f"[FAIL] Line {line_num}: Invalid JSON format - {e}", flush=True)
                error_count += 1
                
    # 결과 출력 (한글 제외하여 인코딩 에러 방지)
    print(f"\n[SUMMARY]", flush=True)
    print(f" - Total Records: {success_count + error_count}", flush=True)
    print(f" - Valid Records: {success_count}", flush=True)
    print(f" - Invalid Records: {error_count}", flush=True)
    
    if success_count > 0:
        print(f" - Avg Input Length: {total_input_len / success_count:.1f} chars", flush=True)
        print(f" - Avg Output Length: {total_output_len / success_count:.1f} chars", flush=True)
    
    if error_count == 0:
        print("\n[RESULT] SUCCESS: All data passed technical validation.", flush=True)
    else:
        print(f"\n[RESULT] FAILED: Found {error_count} errors.", flush=True)

if __name__ == "__main__":
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATA_PATH = os.path.join(BASE_DIR, "../data/sft_training_data.jsonl")
    validate_sft_data(DATA_PATH)
