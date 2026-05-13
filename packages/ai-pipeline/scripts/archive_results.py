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
    
    for target in targets:
        src = target["source"]
        dest = os.path.join(archive_dir, target["dest_name"])
        
        if os.path.exists(src):
            if os.path.isdir(src):
                shutil.copytree(src, dest, dirs_exist_ok=True)
                print(f"- [COPIED DIR] {os.path.basename(src)} -> {target['dest_name']}")
            else:
                shutil.copy2(src, dest)
                print(f"- [COPIED FILE] {os.path.basename(src)} -> {target['dest_name']}")
        else:
            print(f"- [WARNING] Target not found: {src}")

    print("\n[SUCCESS] 스냅샷 아카이빙이 완료되었습니다!")
    print(f"👉 보관 위치: trainer/eval/archives/{version}_{date_str}/")

if __name__ == "__main__":
    archive_files()
