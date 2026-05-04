import os
import json
import glob

# 설정
DATA_DIR = "./"
OUTPUT_FILE = "../data/synthetic_conflict_dataset.jsonl"

def build_jsonl():
    # 저장될 outputs 폴더 확인/생성
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    
    # case_ 로 시작하는 모든 폴더 찾기
    case_folders = sorted(glob.glob(os.path.join(DATA_DIR, "case_*")))
    
    if not case_folders:
        print("❌ 'case_'로 시작하는 폴더를 찾을 수 없습니다.")
        return

    success_count = 0
    error_count = 0

    with open(OUTPUT_FILE, "w", encoding="utf-8") as out_f:
        for folder in case_folders:
            prompt_path = os.path.join(folder, "prompt.md")
            chosen_path = os.path.join(folder, "chosen.json")
            
            if not os.path.exists(prompt_path) or not os.path.exists(chosen_path):
                print(f"⚠️ 경고: {folder} 폴더에 prompt.md 또는 chosen.json이 없습니다. 건너뜁니다.")
                error_count += 1
                continue
                
            try:
                # 1. Prompt.md 읽기
                with open(prompt_path, "r", encoding="utf-8") as pf:
                    prompt_text = pf.read().strip()
                
                # 2. Chosen.json 읽기 및 검증
                with open(chosen_path, "r", encoding="utf-8") as cf:
                    chosen_data = json.load(cf) # JSON 문법 검사됨
                
                # 3. JSONL 포맷으로 병합
                # chosen 필드는 파서가 읽을 수 있도록 '문자열화된 JSON(Stringified JSON)'이어야 합니다.
                jsonl_obj = {
                    "prompt": prompt_text,
                    "chosen": json.dumps(chosen_data, ensure_ascii=False)
                }
                
                # 4. 파일에 쓰기
                out_f.write(json.dumps(jsonl_obj, ensure_ascii=False) + "\n")
                success_count += 1
                
            except json.JSONDecodeError as e:
                print(f"❌ 에러: {chosen_path} 파일의 JSON 문법이 틀렸습니다! (콤마, 따옴표 확인) - {e}")
                error_count += 1
            except Exception as e:
                print(f"❌ 에러: {folder} 처리 중 알 수 없는 오류 발생 - {e}")
                error_count += 1

    print(f"\n✅ JSONL 빌드 완료!")
    print(f" - 성공: {success_count} 건")
    print(f" - 실패: {error_count} 건")
    print(f" - 출력 파일: {os.path.abspath(OUTPUT_FILE)}")

if __name__ == "__main__":
    build_jsonl()
