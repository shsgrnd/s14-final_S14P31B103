import os
import shutil
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "../data")
RESULTS_DIR = os.path.join(BASE_DIR, "../trainer/eval/results")
ARCHIVE_ROOT = os.path.join(BASE_DIR, "../trainer/eval/archives")

def get_next_version():
    """아카이브 폴더를 탐색하여 다음 버전 번호를 자동으로 계산합니다."""
    if not os.path.exists(ARCHIVE_ROOT):
        return "v1"
    
    existing_dirs = [d for d in os.listdir(ARCHIVE_ROOT) if os.path.isdir(os.path.join(ARCHIVE_ROOT, d)) and d.startswith("v")]
    
    if not existing_dirs:
        return "v1"
        
    versions = []
    for d in existing_dirs:
        # v1_20260512 형태에서 번호만 추출
        try:
            v_num = int(d.split('_')[0].replace('v', ''))
            versions.append(v_num)
        except ValueError:
            continue
            
    next_v = max(versions) + 1 if versions else 1
    return f"v{next_v}"

def archive_files():
    print("==========================================")
    print("📦 Evaluation & Dataset Archive Manager")
    print("==========================================")
    
    os.makedirs(ARCHIVE_ROOT, exist_ok=True)
    
    version = get_next_version()
    date_str = datetime.now().strftime("%Y%m%d_%H%M")
    archive_dir = os.path.join(ARCHIVE_ROOT, f"{version}_{date_str}")
    
    os.makedirs(archive_dir)
    print(f"[INFO] Created new archive snapshot: {archive_dir}")
    
    # 1. 아카이브할 대상 폴더/파일 목록
    targets = [
        {"source": DATA_DIR, "dest_name": "data_snapshot"},
        {"source": RESULTS_DIR, "dest_name": "eval_results"}
    ]
    
    # 이전 아카이브 중 가장 최근 시간을 찾기
    existing_dirs = [os.path.join(ARCHIVE_ROOT, d) for d in os.listdir(ARCHIVE_ROOT) if d.startswith("v") and d != os.path.basename(archive_dir)]
    last_archive_time = 0
    if existing_dirs:
        latest_dir = max(existing_dirs, key=os.path.getmtime)
        last_archive_time = os.path.getmtime(latest_dir)

    copied_count = 0
    for target in targets:
        src = target["source"]
        dest = os.path.join(archive_dir, target["dest_name"])
        
        if os.path.exists(src):
            if os.path.isdir(src):
                for root, dirs, files in os.walk(src):
                    for file in files:
                        file_path = os.path.join(root, file)
                        # 마지막 아카이브 시간보다 최신인 파일만 복사
                        if os.path.getmtime(file_path) > last_archive_time:
                            rel_path = os.path.relpath(file_path, src)
                            dest_path = os.path.join(dest, rel_path)
                            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                            shutil.copy2(file_path, dest_path)
                            print(f"- [COPIED] {rel_path} -> {target['dest_name']}")
                            copied_count += 1
            else:
                if os.path.getmtime(src) > last_archive_time:
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    shutil.copy2(src, dest)
                    print(f"- [COPIED FILE] {os.path.basename(src)} -> {target['dest_name']}")
                    copied_count += 1
        else:
            print(f"- [WARNING] Target not found: {src}")

    if copied_count == 0:
        print("- [INFO] 새로운 변경사항이 없어 복사된 파일이 없습니다.")

    print("\n[SUCCESS] 스냅샷 아카이빙이 완료되었습니다!")
    print(f"👉 보관 위치: trainer/eval/archives/{version}_{date_str}/")

if __name__ == "__main__":
    archive_files()
